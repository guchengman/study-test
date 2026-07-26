// ============================================================
// 自动化数据库迁移运行器 (Database Migration Runner)
// ------------------------------------------------------------
// 解决问题：此前迁移靠散落的 run-00X.js 手动执行，曾出现
// 008_fix_schema_mismatch 的 schema 漂移。本运行器统一按编号
// 顺序应用 migrations/*.sql，并用 schema_migrations 表追踪状态，
// 幂等、可重复、可接入 CI。
//
// 用法：
//   node server/src/migrate.js            # 自动模式 (--auto)
//   node server/src/migrate.js --status   # 查看已应用 / 待执行
//   node server/src/migrate.js --baseline # 仅记录当前迁移为已应用(不执行)
//   node server/src/migrate.js --apply    # 强制应用所有未记录迁移(忽略库探测)
//
// 自动模式(--auto，默认)逻辑：
//   - 若 schema_migrations 为空(首次接管)：
//       * 探测 users 表是否存在 -> 已初始化的生产库 => 自动基线(不重放)
//       * 空库 => 按序全量应用 001..00N
//   - 否则(已有追踪) => 仅应用未记录的新迁移
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

function createConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'studyapp',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'study_test',
    charset: 'utf8mb4',
    multipleStatements: true,
  });
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^(\d+).*\.sql$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)/)[1], 10);
      const nb = parseInt(b.match(/^(\d+)/)[1], 10);
      return na - nb;
    });
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !(s.startsWith('--') && !s.includes('\n')));
}

async function ensureTrackingTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getApplied(conn) {
  const [rows] = await conn.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((r) => r.version));
}

async function isDbInitialized(conn) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'users' LIMIT 1`
  );
  return rows.length > 0;
}

async function recordApplied(conn, version) {
  await conn.query('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [version]);
}

async function run() {
  const mode = process.argv[2] || '--auto';
  const conn = await createConnection();
  try {
    await ensureTrackingTable(conn);
    const files = listMigrations();
    const applied = await getApplied(conn);

    if (files.length === 0) {
      console.log('未找到任何迁移文件 (server/migrations/*.sql)。');
      return;
    }

    if (mode === '--status') {
      console.log('=== 迁移状态 ===');
      for (const f of files) {
        console.log(`  [${applied.has(f) ? 'OK     ' : 'PENDING'}] ${f}`);
      }
      console.log(`共 ${files.length} 个，已应用 ${applied.size} 个。`);
      return;
    }

    if (mode === '--baseline') {
      for (const f of files) {
        if (!applied.has(f)) {
          await recordApplied(conn, f);
          console.log(`  基线记录: ${f}`);
        }
      }
      console.log('基线完成：当前迁移已标记为已应用(未执行)。');
      return;
    }

    let toApply = files.filter((f) => !applied.has(f));

    // 首次接管：schema_migrations 为空且所有迁移均未记录
    if ((mode === '--auto') && toApply.length === files.length && files.length > 0) {
      const initialized = await isDbInitialized(conn);
      if (initialized) {
        console.log('检测到已初始化的数据库，自动基线现有迁移(不重新执行)...');
        for (const f of files) {
          await recordApplied(conn, f);
          console.log(`  基线: ${f}`);
        }
        toApply = [];
      } else {
        console.log('检测到空数据库，按序全量应用初始迁移...');
      }
    }

    if (toApply.length === 0) {
      console.log('没有需要执行的迁移。');
      return;
    }

    for (const f of toApply) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      const statements = splitStatements(sql);
      console.log(`应用迁移: ${f} (${statements.length} 条语句)`);
      try {
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await recordApplied(conn, f);
        console.log(`  ✅ 完成: ${f}`);
      } catch (err) {
        console.error(`  ❌ 失败: ${f} -> ${err.message}`);
        throw err; // 中止，避免后续迁移基于错误状态继续
      }
    }
    console.log(`迁移完成，本次共应用 ${toApply.length} 个。`);
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('迁移运行器异常:', err.message || err);
  process.exit(1);
});

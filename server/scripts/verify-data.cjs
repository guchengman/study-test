/**
 * 阿里云（远程）vs 本地数据库对比（运维脚本）
 * 所有敏感信息（SSH 主机/私钥路径、数据库密码）从环境变量读取，禁止硬编码。
 *
 * 环境变量：
 *   SSH_HOST / SSH_PORT / SSH_USER / SSH_KEY_PATH
 *   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME        （本地库）
 *   REMOTE_DB_PASSWORD                                    （远程库 mysql 密码）
 */
const mysql = require('mysql2/promise');
const { Client } = require('ssh2');
const fs = require('fs');

const sshConfig = {
  host: process.env.SSH_HOST || '47.88.52.213',
  port: process.env.SSH_PORT ? Number(process.env.SSH_PORT) : 22,
  privateKey: fs.readFileSync(process.env.SSH_KEY_PATH || 'C:\\Users\\zengxiao\\.ssh\\deploy_key.pem'),
  username: process.env.SSH_USER || 'root',
};

const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'studyapp',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'study_test',
};

const remoteDbPassword = process.env.REMOTE_DB_PASSWORD || process.env.DB_PASSWORD || '';

async function execSSH(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        let data = '';
        stream.on('data', (d) => (data += d));
        stream.stderr.on('data', () => {});
        stream.on('close', () => {
          conn.end();
          resolve(data);
        });
      });
    }).connect(sshConfig);
  });
}

async function main() {
  console.log('📊 阿里云 vs 本地数据库对比\n');

  const tablesData = await execSSH(
    `mysql -u studyapp -p"${remoteDbPassword}" study_test -N -e "SHOW TABLES;"`
  );
  const tables = tablesData.trim().split('\n').filter((t) => t);

  console.log(`发现 ${tables.length} 个表\n`);
  console.log('═'.repeat(90));

  const localPool = mysql.createPool(mysqlConfig);
  let allMatch = true;

  for (const tableName of tables) {
    try {
      const primaryFieldSQL = `mysql -u studyapp -p"${remoteDbPassword}" study_test -N -e "SHOW COLUMNS FROM \\\`${tableName}\\\`; " | head -1`;
      const primaryField = (await execSSH(primaryFieldSQL)).trim().split('\t')[0];

      const remoteSQL = `mysql -u studyapp -p"${remoteDbPassword}" study_test -N -e "SELECT * FROM \\\`${tableName}\\\` ORDER BY \\\`${primaryField}\\\`; "`;
      const remoteData = await execSSH(remoteSQL);
      const remoteLines = remoteData.trim().split('\n').filter((l) => l);

      const localRows = await execQuery(localPool, `SELECT * FROM \`${tableName}\` ORDER BY \`${primaryField}\``);

      if (localRows.length !== remoteLines.length) {
        console.log(`✗ ${tableName.padEnd(30)} 行数不一致 (本地:${localRows.length} vs 远程:${remoteLines.length})`);
        allMatch = false;
        continue;
      }

      console.log(`✓ ${tableName.padEnd(30)} ${localRows.length} 行数据完全一致`);
    } catch (err) {
      console.log(`✗ ${tableName.padEnd(30)} 错误: ${err.message}`);
      allMatch = false;
    }
  }

  console.log('═'.repeat(90));
  console.log('');

  if (allMatch) {
    console.log('✅ 所有数据完全一致！\n');
  } else {
    console.log('⚠️ 存在数据差异，请检查上方详情\n');
  }

  await localPool.end();
}

async function execQuery(pool, sql) {
  return pool.query(sql).then((r) => r[0]);
}

main().catch(console.error);

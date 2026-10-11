import { defineConfig } from 'vitest/config';

// 服务端单元测试：只跑 tests/unit（tests/ 根目录下的 *.mjs 为历史手工脚本，不纳入）
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,mjs}'],
    environment: 'node',
  },
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  /** 生产构建不把任何 API Key 打进前端包；Gemini 可走服务端 /api/ai（环境变量 GEMINI_API_KEY），其它模型仍用用户在设置里填写的 Key */
  const noKeyInBundle = mode === 'production';
  const K = (name: string) => JSON.stringify(noKeyInBundle ? '' : (env[name] || ''));
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'fix-html-paths',
        apply: 'build',
        closeBundle() {
          const htmlPath = path.resolve(process.cwd(), 'dist/index.html');
          console.log('[fix-html-paths] Processing:', htmlPath);
          if (fs.existsSync(htmlPath)) {
            let html = fs.readFileSync(htmlPath, 'utf-8');
            html = html.replace(/src="\/assets\//g, 'src="./assets/');
            html = html.replace(/href="\/assets\//g, 'href="./assets/');
            fs.writeFileSync(htmlPath, html);
            console.log('[fix-html-paths] Fixed paths in index.html');
          } else {
            console.log('[fix-html-paths] File not found:', htmlPath);
          }
        }
      }
    ],
    base: './',
    define: {
      'process.env.GEMINI_API_KEY': K('GEMINI_API_KEY'),
      'process.env.DEEPSEEK_API_KEY': K('DEEPSEEK_API_KEY'),
      'process.env.QWEN_API_KEY': K('QWEN_API_KEY'),
      'process.env.ZHIPU_API_KEY': K('ZHIPU_API_KEY'),
      'process.env.MOONSHOT_API_KEY': K('MOONSHOT_API_KEY'),
      'process.env.BAICHUAN_API_KEY': K('BAICHUAN_API_KEY'),
      'process.env.HUNYUAN_API_KEY': K('HUNYUAN_API_KEY'),
      'process.env.ERNIE_API_KEY': K('ERNIE_API_KEY'),
      'process.env.OPENROUTER_API_KEY': K('OPENROUTER_API_KEY'),
      'process.env.DEFAULT_OPENROUTER_MODEL': JSON.stringify(env.DEFAULT_OPENROUTER_MODEL || 'openai/gpt-4o'),
      'process.env.EMAILJS_SERVICE_ID': JSON.stringify(env.EMAILJS_SERVICE_ID || ''),
      'process.env.EMAILJS_TEMPLATE_ID': JSON.stringify(env.EMAILJS_TEMPLATE_ID || ''),
      'process.env.EMAILJS_PUBLIC_KEY': JSON.stringify(env.EMAILJS_PUBLIC_KEY || ''),
      'process.env.CUSTOM_API_ENDPOINT': JSON.stringify(noKeyInBundle ? '' : (env.CUSTOM_API_ENDPOINT || '')),
      'process.env.CUSTOM_API_KEY': K('CUSTOM_API_KEY'),
      'process.env.DEFAULT_AI_MODEL': JSON.stringify(env.DEFAULT_AI_MODEL || 'deepseek'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5173,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3100',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['motion'],
            'vendor-lucide': ['lucide-react'],
            'vendor-pdf': ['pdfjs-dist'],
            'vendor-ai': ['@google/genai'],
          },
        },
      },
    },
  };
});

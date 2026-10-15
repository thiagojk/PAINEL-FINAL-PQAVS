import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],build:{rollupOptions:{output:{manualChunks:{'echarts':['echarts/core','echarts/charts','echarts/components','echarts/renderers'],'react':['react','react-dom','react-router-dom']}}}},server:{proxy:{'/api':'http://127.0.0.1:8000'}}});

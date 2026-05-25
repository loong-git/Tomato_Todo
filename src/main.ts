import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './styles/global.css'

// Loading动画
const loader = document.createElement('div')
loader.id = 'app-loader'
loader.innerHTML = `
<style>
  #app-loader {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #1a1614;
    z-index: 9999;
  }
  [data-theme="light"] #app-loader {
    background: #f5f2ef;
  }
  #app-loader .loader-text {
    color: #faf5f0;
    font-family: DM Sans, sans-serif;
    font-size: 14px;
    opacity: 0.8;
  }
  [data-theme="light"] #app-loader .loader-text {
    color: #1a1512;
  }
  #app-loader .loader-tomato {
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
  }
  [data-theme="light"] #app-loader .loader-tomato {
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15));
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(0.95); }
  }
</style>
<div class="loader-tomato" style="width:60px;height:60px;position:relative;margin-bottom:20px">
  <div style="position:absolute;top:0;left:26px;width:8px;height:10px;background:#4a7c59;border-radius:3px"></div>
  <div style="position:absolute;top:3px;left:15px;width:12px;height:8px;background:#4a7c59;border-radius:50%;transform:rotate(-30deg)"></div>
  <div style="position:absolute;top:3px;right:15px;width:12px;height:8px;background:#4a7c59;border-radius:50%;transform:rotate(30deg)"></div>
  <div style="position:absolute;top:8px;left:5px;width:50px;height:45px;background:radial-gradient(circle at 35% 35%,#ff6b5b,#e74c3c);border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:pulse 1.5s ease-in-out infinite"></div>
</div>
<div class="loader-text">欢迎使用番茄TODO</div>
`
document.body.appendChild(loader)

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
app.mount('#app')

// Vue挂载后移除loading - 延长显示时间
const removeLoader = () => {
  setTimeout(() => {
    loader.style.opacity = '0'
    loader.style.transition = 'opacity 0.5s'
    setTimeout(() => loader.remove(), 500)
  }, 1500) // 动画保持1.5秒后再开始淡出
}
if (document.readyState === 'complete') {
  removeLoader()
} else {
  window.addEventListener('load', removeLoader)
}

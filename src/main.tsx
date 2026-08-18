import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import logoUrl from "./assets/logo.png"

const root = document.getElementById("root")

function renderBootFallback(message: string) {
  if (!root) {
    return
  }

  root.innerHTML = `
    <main style="box-sizing:border-box;display:flex;height:100vh;align-items:center;justify-content:center;padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#262522;background:#fff;">
      <div style="max-width:256px;text-align:center;">
        <img src="${logoUrl}" alt="Esd-Eannotation" style="display:block;width:48px;height:48px;margin:0 auto 12px;border-radius:12px;" />
        <p style="margin:0;font-size:14px;font-weight:500;">${message}</p>
      </div>
    </main>
  `
}

window.addEventListener("error", (event) => {
  renderBootFallback(
    event.message
      ? `Esd-Eannotation UI 初始化失败：${event.message}`
      : "Esd-Eannotation UI 初始化失败"
  )
})

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason
  renderBootFallback(
    reason instanceof Error
      ? `Esd-Eannotation UI 初始化失败：${reason.message}`
      : "Esd-Eannotation UI 初始化失败"
  )
})

if (!root) {
  throw new Error("Root element not found")
}

try {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
} catch (error) {
  renderBootFallback(
    error instanceof Error
      ? `Esd-Eannotation UI 初始化失败：${error.message}`
      : "Esd-Eannotation UI 初始化失败"
  )
}

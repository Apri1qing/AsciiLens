import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from '@/App.jsx'
import '@/index.css'

// Standard Vercel Web Analytics pageviews only. Do not add custom track/pageview
// helpers, beforeSend, UTM, or virtual-page options until a later reviewed change.
inject()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

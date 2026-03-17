import express from 'express'
import cors from 'cors'
import authRoutes from './routes/authRoutes.js'
import productRoutes from './routes/productRoutes.js'
import brandRoutes from './routes/brandRoutes.js'
import categoryRoutes from './routes/categoryRoutes.js'
import tierListRoutes from './routes/tierListRoutes.js'
import userRoutes from './routes/userRoutes.js'
import triesRoutes from './routes/triesRoutes.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/brands', brandRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/tier-lists', tierListRoutes)
app.use('/api/tries', triesRoutes)
app.use('/api/users', userRoutes)
app.use('/api/feed', userRoutes)

app.listen(PORT, () => {
  console.log(`biteclimb API running on http://localhost:${PORT}`)
})

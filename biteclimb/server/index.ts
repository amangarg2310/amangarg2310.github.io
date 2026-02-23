import express from 'express'
import cors from 'cors'
import authRoutes from './routes/authRoutes.js'
import dishRoutes from './routes/dishRoutes.js'
import restaurantRoutes from './routes/restaurantRoutes.js'
import tierListRoutes from './routes/tierListRoutes.js'
import userRoutes from './routes/userRoutes.js'

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
app.use('/api/dishes', dishRoutes)
app.use('/api/restaurants', restaurantRoutes)
app.use('/api/tier-lists', tierListRoutes)
app.use('/api/users', userRoutes)
app.use('/api/feed', userRoutes)

app.listen(PORT, () => {
  console.log(`biteclimb API running on http://localhost:${PORT}`)
})

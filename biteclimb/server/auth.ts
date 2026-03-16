import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

const JWT_SECRET = process.env.JWT_SECRET || 'biteclimb-dev-secret-change-in-production'

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string }
}

export interface AuthRequest extends Request {
  userId?: string
}

/** Requires a valid JWT. Returns 401 if missing/invalid. */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  try {
    const { userId } = verifyToken(header.slice(7))
    req.userId = userId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

/** Optionally attaches userId if token present, but doesn't block. */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const { userId } = verifyToken(header.slice(7))
      req.userId = userId
    } catch {
      // invalid token, proceed without auth
    }
  }
  next()
}

import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { config } from 'dotenv'
import { connectDB } from './db/dbConfiguration'
import { routesInit } from './routes/config.routes'
import { SECRET } from './constant/constant'

const bootstrap = async (): Promise<void> => {
  config()

  const app: Express = express()
  app.use(express.json())
  app.use(cookieParser())
  const port = SECRET.PORT
  await connectDB()

  routesInit(app)

  app.use(cors({
    origin: '*',
    credentials: true
  }))

  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
  })
}

void bootstrap()

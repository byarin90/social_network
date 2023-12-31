import { Request, Response } from 'express'
import { userValidation } from '../validations/userValidations'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { clearTokensFromCookies, createJWT, saveAccessTokenOnCookie, saveRefreshTokenOnCookie } from '../utils/jwtUtil'
import { SECRET } from '../constant/constant'
import RefreshToken from '../models/refreshTokenModel'
import { IDecodedToken } from '../lib/@types/express/index'
import { IUser } from '../lib/@types/db'
import { User } from '../models/userModel'
import logger from '../lib/logger'

const authCtrl = {
  signUp: async (req: Request, res: Response) => {
    try {
      // Validate the request body
      const validatedRequestBody: IUser = userValidation.UserSchema(req.body)
      const user = new User(validatedRequestBody)
      // Hash the password
      const salt = (await bcrypt.genSalt(10))
      user.password = (await bcrypt.hash(user.password, salt))

      // Save the new user
      await user.save()
      const userWitooutPassword: any = { ...user }

      delete userWitooutPassword.password
      const userCreated = userWitooutPassword._doc

      delete userCreated.password

      logger.debug('User created')

      res.status(201).send(userCreated)
    } catch (error: any) {
      if (error.code === 11000 && error.keyPattern.email) {
        return res
          .status(400)
          .send({ error: 'Email already exists', err: error })
      }
      if (error.code === 11000 && error.keyPattern.username) {
        return res
          .status(400)
          .send({ error: 'Username already exists', err: error })
      }
      if (error instanceof z.ZodError) {
        // Validation error
        return res.status(400).send({ error: error.errors })
      } else {
        // Other errors (like a database error)
        return res.status(500).send({ error })
      }
    }
  },
  login: async (req: Request, res: Response) => {
    try {
      const { identifier, password } = userValidation.LoginSchema(req.body)

      let user: IUser | null

      // Check if the identifier is a username or email
      if (identifier.includes('@')) {
        user = await User.findOne({ email: identifier })
      } else {
        user = await User.findOne({ username: identifier })
      }

      if (!user && identifier.includes('@')) {
        return res.status(404).json({ error: 'Email or password inavalid' })
      }

      if (!user && !identifier.includes('@')) {
        return res.status(404).json({ error: 'Username or password inavalid' })
      }

      if (!user) {
        return res.status(404).json({ error: 'Email or password inavalid' })
      }
      // Check the password
      const isPasswordCorrect = await bcrypt.compare(password, user.password)
      if (!isPasswordCorrect && identifier.includes('@')) {
        return res.status(401).json({ error: 'Email or password inavalid' })
      }

      if (!isPasswordCorrect && !identifier.includes('@')) {
        return res.status(401).json({ error: 'Username or password inavalid' })
      }

      // Create a JWT token
      const accessToken = createJWT(user, SECRET.TTL_ACCESS_TOKEN)
      const refreshToken = createJWT(user, SECRET.TTL_REFRESH_TOKEN)
      // if user was logged in before, delete the refresh token from the database
      await RefreshToken.deleteMany({ user: user._id })
      // Save the refresh token in the database
      const newRefreshToken = new RefreshToken({
        user: user._id,
        token: refreshToken
      })
      await newRefreshToken.save()
      // Send tokens in http-only cookies

      saveAccessTokenOnCookie(res, accessToken)
      saveRefreshTokenOnCookie(res, refreshToken)

      // Send response
      res.status(200).json({ message: 'Logged in successfully', login: true })
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Validation error
        return res.status(400).json({ error: error.errors })
      } else {
        // Other errors (like a database error)
        return res.status(500).json({ error: 'Server error' })
      }
    }
  },
  logout: async (req: Request, res: Response) => {
    // Clear the token cookie
    clearTokensFromCookies(res)
    const { _id } = req.payload as IDecodedToken
    // Delete the refresh token from the database
    await RefreshToken.deleteMany({ user: _id })
    // Send response
    res.status(200).json({ message: 'Logged out successfully' })
  },
  protected: (req: Request, res: Response) => {
    const { role } = req.payload as IDecodedToken

    // This route is now protected
    res.json({ msg: "You're authenticated!", role })
  },
  isActiveToggle: async (req: Request, res: Response) => {
    try {
      const { _id } = req.payload as IDecodedToken

      const user = await User.findById(_id)
      if (!user) return res.status(400).json({ msg: 'User does not exist' })

      user.isActive = !user.isActive
      await user.save()
      if (user.isActive) {
        return res.json({ msg: 'User is active' })
      } else {
        return res.json({ msg: 'User is inactive' })
      }
    } catch (err: any) {
      return res.status(500).json({ msg: err.message })
    }
  }
}

export default authCtrl

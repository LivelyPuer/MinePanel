import { createContext, useContext, useState, useEffect } from 'react'
import { getAuthMe, login as apiLogin, logout as apiLogout } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuthMe()
      .then(data => setUser(data))
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const data = await apiLogin(username, password)
    setUser(data)
    return data
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
  }

  const updateUser = (data) => {
    setUser(data)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

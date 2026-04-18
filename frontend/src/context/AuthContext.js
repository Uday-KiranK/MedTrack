import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { Platform } from 'react-native';

// Dynamically connect to the proper IP depending on environment
export const API_URL = Platform.OS === 'web' 
  ? 'http://localhost:5000/api'
  : 'http://10.0.12.138:5000/api'; // Your laptop's exact Local Wi-Fi IP for Expo Go App

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSplashLoading, setIsSplashLoading] = useState(true);

  // Re-hydrate token from async storage
  const loadToken = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('userToken');
      if (storedToken) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        const response = await axios.get(`${API_URL}/auth/protected`); 
        setUserToken(storedToken);
        setUserInfo(response.data.user);
      }
    } catch (e) {
      console.log('Failed to load token', e);
      await AsyncStorage.removeItem('userToken');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setIsSplashLoading(false);
    }
  };

  useEffect(() => {
    loadToken();
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });
      const { token, user } = response.data;
      await AsyncStorage.setItem('userToken', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUserToken(token);
      setUserInfo(user);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPhone = async (phone) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        phone
      });
      return { success: true, requiresOtp: response.data.requiresOtp, phone: response.data.phone };
    } catch (error) {
       return { 
        success: false, 
        message: error.response?.data?.message || 'Phone login failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (phone, otp) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/verify-otp`, {
        phone,
        otp
      });
      const { token, user } = response.data;
      await AsyncStorage.setItem('userToken', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUserToken(token);
      setUserInfo(user);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'OTP verification failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name, email, phone, password, role) => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        name,
        email,
        phone,
        password,
        role, // "doctor" or "patient"
      });
      return { success: true, requiresOtp: response.data.requiresOtp, phone: response.data.phone };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await AsyncStorage.removeItem('userToken');
      delete axios.defaults.headers.common['Authorization'];
      setUserToken(null);
      setUserInfo(null);
    } catch(e) {
      console.log('Failed to remove token', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      login,
      loginWithPhone,
      verifyOtp,
      logout,
      register,
      userToken,
      userInfo,
      isLoading,
      isSplashLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

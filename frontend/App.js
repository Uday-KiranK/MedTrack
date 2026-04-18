import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

import { View } from 'react-native';
import ParticleBackground from './src/components/ParticleBackground';

import './src/i18n/i18n'; // Import i18n configuration

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <ParticleBackground />
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </View>
  );
}

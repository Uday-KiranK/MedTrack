import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

import './src/i18n'; // Import i18n configuration

export default function App() {
  return (
    <ErrorBoundary>
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <AuthProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </AuthProvider>
      </View>
    </ErrorBoundary>
  );
}

import React, { useContext } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { AuthContext } from '../context/AuthContext';
import { COLORS } from '../theme/theme';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PatientDashboard from '../screens/PatientDashboard';
import DoctorDashboard from '../screens/DoctorDashboard';
import AdminDashboard from '../screens/AdminDashboard';
import PharmacyDashboard from '../screens/PharmacyDashboard';
import ReceptionDashboard from '../screens/ReceptionDashboard';

const Stack = createNativeStackNavigator();

const TransparentTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

export default function AppNavigator() {
  const { userToken, userInfo, isSplashLoading } = useContext(AuthContext);

  if (isSplashLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={TransparentTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        {userToken == null ? (
          // Auth Stack
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          // Main Stack based on Role
          <>
            {userInfo?.role === 'admin' ? (
              <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
            ) : userInfo?.role === 'doctor' ? (
              <Stack.Screen name="DoctorDashboard" component={DoctorDashboard} />
            ) : userInfo?.role === 'pharmacy_manager' ? (
              <Stack.Screen name="PharmacyDashboard" component={PharmacyDashboard} />
            ) : userInfo?.role === 'receptionist' ? (
              <Stack.Screen name="ReceptionDashboard" component={ReceptionDashboard} />
            ) : (
              <Stack.Screen name="PatientDashboard" component={PatientDashboard} />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

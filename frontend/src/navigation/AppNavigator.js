import React, { useContext } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';

import { AuthContext } from '../context/AuthContext';
import { COLORS } from '../theme/theme';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PatientDashboard from '../screens/PatientDashboard';
import DoctorDashboard from '../screens/DoctorDashboard';
import AdminDashboard from '../screens/AdminDashboard';
import PharmacyDashboard from '../screens/PharmacyDashboard';

const Stack = createNativeStackNavigator();

function StaffWorkspacePlaceholder() {
  const { userInfo, logout } = useContext(AuthContext);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F8FAFC' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.primary, marginBottom: 8 }}>
        {userInfo?.role === 'pharmacy_manager' ? 'Pharmacy Manager Portal' : 'Receptionist Portal'}
      </Text>
      <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 20 }}>
        Welcome {userInfo?.name}. Your account is active and approved. Dedicated dashboard for this role is scheduled in the next V3 phase.
      </Text>
      <TouchableOpacity
        onPress={logout}
        style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700' }}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

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
              <Stack.Screen name="StaffWorkspacePlaceholder" component={StaffWorkspacePlaceholder} />
            ) : (
              <Stack.Screen name="PatientDashboard" component={PatientDashboard} />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

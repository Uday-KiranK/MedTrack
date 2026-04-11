import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { AuthContext } from '../context/AuthContext';
import { COLORS } from '../theme/theme';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PatientDashboard from '../screens/PatientDashboard';
import DoctorDashboard from '../screens/DoctorDashboard';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { userToken, userInfo, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          // Auth Stack
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          // Main Stack based on Role
          <>
            {userInfo?.role === 'doctor' ? (
              <Stack.Screen name="DoctorDashboard" component={DoctorDashboard} />
            ) : (
              <Stack.Screen name="PatientDashboard" component={PatientDashboard} />
            )}
            {/* Later we can add LabReportScreen, PrescriptionScreen, etc. */}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

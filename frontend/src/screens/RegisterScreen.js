import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient'); // Default role
  
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  
  const { register, verifyOtp, isLoading } = useContext(AuthContext);

  const handleRegister = async () => {
    if(!name || !email || !phone || !password) return;
    const res = await register(name, email, phone, password, role);
    if (!res.success) {
      alert(res.message);
    } else if (res.requiresOtp) {
      setShowOtp(true);
    }
  };

  const handleVerifyOtp = async () => {
    if(!otp) return;
    const res = await verifyOtp(phone, otp);
    if (!res.success) {
      alert(res.message);
    }
  };

  if (showOtp) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <Text style={styles.title}>Verify OTP</Text>
          <Text style={styles.subtitle}>Check your terminal (simulated SMS) for the OTP.</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Enter 4-digit OTP</Text>
            <TextInput
              style={styles.input}
              placeholder="1234"
              value={otp}
              onChangeText={setOtp}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verify & Login</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join MedTrack to manage you health better.</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Role Selection Tabs */}
        <View style={styles.roleContainer}>
          <TouchableOpacity 
            style={[styles.roleButton, role === 'patient' && styles.roleButtonActive]}
            onPress={() => setRole('patient')}
          >
            <Text style={[styles.roleText, role === 'patient' && styles.roleTextActive]}>Patient</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.roleButton, role === 'doctor' && styles.roleButtonActive]}
            onPress={() => setRole('doctor')}
          >
            <Text style={[styles.roleText, role === 'doctor' && styles.roleTextActive]}>Doctor</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
             <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.primary,
    marginBottom: 8,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.text,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...TYPOGRAPHY.body,
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  roleButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  roleText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  roleTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    ...SHADOWS.small,
  },
  buttonText: {
    ...TYPOGRAPHY.button,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  footerLink: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '600',
  }
});

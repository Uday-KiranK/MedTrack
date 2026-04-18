import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';

import { AuthContext } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function LoginScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' | 'phone'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [phone, setPhone] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  
  const { login, loginWithPhone, verifyOtp, isLoading } = useContext(AuthContext);

  const handleLogin = async () => {
    if (loginMethod === 'email') {
      if(!email || !password) return;
      const res = await login(email, password);
      if (!res.success) alert(res.message);
    } else {
      if(!phone) return;
      const res = await loginWithPhone(phone);
      if (!res.success) {
        alert(res.message);
      } else if (res.requiresOtp) {
        setShowOtp(true);
      }
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
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('Verify OTP')}</Text>
          <Text style={styles.subtitle}>Check your terminal for the OTP.</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Enter 4-digit OTP</Text>
            <TextInput
              style={styles.input}
              placeholder="1234"
              value={otp}
              onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              maxLength={4}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleVerifyOtp}
            />
          </View>
          <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={isLoading || otp.length !== 4}>
            {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('Verify OTP')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => setShowOtp(false)}>
             <Text style={styles.footerLink}>Go Back</Text>
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
        <View style={{flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16}}>
           <Text style={{marginRight: 8, color: COLORS.textSecondary, fontWeight: '600'}}>{t('Change Lang:')}</Text>
           <View style={styles.pickerContainerSmall}>
             <Picker
               selectedValue={i18n.language}
               style={{ height: 40, width: 130, color: COLORS.text, backgroundColor: '#E6F4F1' }}
               onValueChange={(itemValue) => i18n.changeLanguage(itemValue)}
             >
               <Picker.Item label="EN" value="en" color="#000" />
               <Picker.Item label="HI (हिंदी)" value="hi" color="#000" />
               <Picker.Item label="TA (தமிழ்)" value="ta" color="#000" />
               <Picker.Item label="TE (తెలుగు)" value="te" color="#000" />
               <Picker.Item label="KN (ಕನ್ನಡ)" value="kn" color="#000" />
             </Picker>
           </View>
        </View>

        <View style={{alignItems: 'center', marginBottom: 24}}>
           <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
           <Text style={[styles.title, { textAlign: 'center' }]}>{t('MedTrack')}</Text>
           <Text style={[styles.subtitle, { textAlign: 'center' }]}>{t('welcome_back')}</Text>
        </View>

        <View style={styles.toggleContainer}>
           <TouchableOpacity 
             style={[styles.toggleBtn, loginMethod === 'email' && styles.activeToggleBtn]}
             onPress={() => setLoginMethod('email')}
           >
              <Text style={[styles.toggleText, loginMethod === 'email' && styles.activeToggleText]}>Email</Text>
           </TouchableOpacity>
           <TouchableOpacity 
             style={[styles.toggleBtn, loginMethod === 'phone' && styles.activeToggleBtn]}
             onPress={() => setLoginMethod('phone')}
           >
              <Text style={[styles.toggleText, loginMethod === 'phone' && styles.activeToggleText]}>Phone</Text>
           </TouchableOpacity>
        </View>

        {loginMethod === 'email' ? (
          <>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('Email Address')}</Text>
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
              <Text style={styles.label}>{t('Password')}</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </>
        ) : (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('Phone Number')}</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        )}

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
             <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{loginMethod === 'phone' ? t('Send OTP') : t('Login')}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t("Don't have an account?")} </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.footerLink}>{t('Register')}</Text>
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
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeToggleBtn: {
    backgroundColor: COLORS.surface,
    ...SHADOWS.small,
  },
  toggleText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  activeToggleText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 20,
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
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12
  },
  pickerContainerSmall: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  logoImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain'
  }
});

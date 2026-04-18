import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function RegisterScreen({ navigation }) {
  const { t, i18n } = useTranslation();
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
          <Text style={styles.title}>{t('Verify OTP')}</Text>
          <Text style={styles.subtitle}>{t('Check your terminal (simulated SMS) for the OTP.')}</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('Enter 4-digit OTP')}</Text>
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
            {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('Verify & Login')}</Text>}
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
           <Text style={[styles.title, { textAlign: 'center' }]}>{t('Create Account')}</Text>
           <Text style={[styles.subtitle, { textAlign: 'center' }]}>{t('Join MedTrack to manage you health better.')}</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('Name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Name")}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('Email Address')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Email Address")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('Phone Number')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Phone Number")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('Password')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Password")}
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
            <Text style={[styles.roleText, role === 'patient' && styles.roleTextActive]}>{t('Patient')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.roleButton, role === 'doctor' && styles.roleButtonActive]}
            onPress={() => setRole('doctor')}
          >
            <Text style={[styles.roleText, role === 'doctor' && styles.roleTextActive]}>{t('Doctor')}</Text>
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
            <Text style={styles.buttonText}>{t('Register')}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('Already have an account?')} </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>{t('Login')}</Text>
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

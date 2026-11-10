import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';
import LanguageSelectorModal, { LanguageButton } from '../components/LanguageSelectorModal';

const ROLE_OPTIONS = [
  { key: 'patient', label: 'Patient' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'receptionist', label: 'Receptionist' },
  { key: 'pharmacy_manager', label: 'Pharmacy Mgr' },
];

export default function RegisterScreen({ navigation }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [organizationCode, setOrganizationCode] = useState('MEDTRACK01');
  const [specialization, setSpecialization] = useState('');
  const [langModalVisible, setLangModalVisible] = useState(false);

  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  const { register, verifyOtp, isLoading } = useContext(AuthContext);

  const handleRegister = async () => {
    if (!name || !email || !phone || !password) return;
    const res = await register(name, email, phone, password, role, {
      organizationCode: role !== 'patient' ? organizationCode : undefined,
      specialization: role === 'doctor' ? specialization : undefined,
    });
    if (!res.success) {
      alert(res.message);
    } else if (res.requiresOtp) {
      setShowOtp(true);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) return;
    const res = await verifyOtp(phone, otp);
    if (!res.success) {
      alert(res.message);
    } else if (res.pendingApproval) {
      setShowOtp(false);
      setAwaitingApproval(true);
    }
  };

  if (awaitingApproval) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.pendingCard}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>⏳</Text>
            <Text style={[styles.title, { textAlign: 'center', fontSize: 22 }]}>Pending Admin Approval</Text>
            <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 20 }]}>
              Your phone has been verified! Because you registered as clinic staff ({ROLE_OPTIONS.find(r => r.key === role)?.label}), your Clinic Admin must approve your account and assign your features before you can sign in.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.buttonText}>{t('Back to Login') || 'Back to Login'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (showOtp) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('Verify OTP')}</Text>
          <Text style={styles.subtitle}>Check your SMS for the OTP. (If delayed by carrier, enter test code 1234)</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('Enter 4-digit OTP')}</Text>
            <TextInput
              style={styles.input}
              placeholder="1234"
              placeholderTextColor="#64748B"
              value={otp}
              onChangeText={setOtp}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('Verify & Continue') || t('Verify & Login')}</Text>}
          </TouchableOpacity>
        </View>
        <LanguageSelectorModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 }}>
          <LanguageButton onPress={() => setLangModalVisible(true)} />
        </View>

        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
          <Text style={[styles.title, { textAlign: 'center' }]}>{t('Create Account')}</Text>
          <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 12 }]}>{t('Join MedTrack to manage your health better.')}</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('Name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Name")}
            placeholderTextColor="#64748B"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('Email Address')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Email Address")}
            placeholderTextColor="#64748B"
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
            placeholderTextColor="#64748B"
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
            placeholderTextColor="#64748B"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Role Selection Grid */}
        <Text style={[styles.label, { marginBottom: 8 }]}>Select Role</Text>
        <View style={styles.roleGrid}>
          {ROLE_OPTIONS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.roleButtonGrid, role === item.key && styles.roleButtonActive]}
              onPress={() => setRole(item.key)}
            >
              <Text style={[styles.roleText, role === item.key && styles.roleTextActive]}>
                {t(item.label) || item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {role !== 'patient' && (
          <View style={styles.staffExtraBox}>
            <Text style={styles.staffNote}>
              🔒 Staff accounts require Clinic Admin approval before signing in.
            </Text>
            <View style={[styles.inputContainer, { marginTop: 10, marginBottom: role === 'doctor' ? 12 : 0 }]}>
              <Text style={styles.label}>Clinic Invite Code</Text>
              <TextInput
                style={styles.input}
                placeholder="MEDTRACK01"
                placeholderTextColor="#64748B"
                value={organizationCode}
                onChangeText={setOrganizationCode}
                autoCapitalize="characters"
              />
            </View>
            {role === 'doctor' && (
              <View style={[styles.inputContainer, { marginBottom: 0 }]}>
                <Text style={styles.label}>Specialization (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. General Physician, Cardiology"
                  placeholderTextColor="#64748B"
                  value={specialization}
                  onChangeText={setSpecialization}
                />
              </View>
            )}
          </View>
        )}

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
      </ScrollView>
      <LanguageSelectorModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} />
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
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
  },
  input: {
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...TYPOGRAPHY.body,
    color: '#0F172A',
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
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  roleButtonGrid: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  staffExtraBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  staffNote: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 17,
  },
  pendingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    ...SHADOWS.medium,
  }
});

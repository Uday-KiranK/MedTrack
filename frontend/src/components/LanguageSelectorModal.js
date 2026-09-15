import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', flag: '🌐' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', flag: '🇮🇳' },
];

export default function LanguageSelectorModal({ visible, onClose }) {
  const { i18n, t } = useTranslation();

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    onClose();
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('Select Language')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ width: '100%', maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 8 }}>
            {LANGUAGES.map((item) => {
              const isSelected = i18n.language === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.langCard, isSelected && styles.langCardSelected]}
                  onPress={() => handleSelect(item.code)}
                >
                  <View style={styles.langLeft}>
                    <Text style={styles.flag}>{item.flag}</Text>
                    <View>
                      <Text style={[styles.nativeText, isSelected && styles.selectedText]}>{item.native}</Text>
                      <Text style={styles.labelSub}>{item.label}</Text>
                    </View>
                  </View>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function LanguageButton({ onPress }) {
  const { i18n } = useTranslation();
  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  return (
    <TouchableOpacity style={styles.triggerButton} onPress={onPress}>
      <Text style={styles.triggerFlag}>{currentLang.flag}</Text>
      <Text style={styles.triggerText}>{currentLang.native}</Text>
      <Text style={styles.triggerArrow}>▾</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
    gap: 6,
  },
  triggerFlag: {
    fontSize: 14,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  triggerArrow: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '800',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    color: COLORS.primary,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  langCardSelected: {
    backgroundColor: '#F0FDFA',
    borderColor: COLORS.primary,
  },
  langLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flag: {
    fontSize: 20,
  },
  nativeText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  selectedText: {
    color: COLORS.primary,
  },
  labelSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  checkMark: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
  },
});

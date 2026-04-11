export const COLORS = {
  primary: '#0B5FEb',       // Vibrant medical blue
  primaryLight: '#E8F1FF',  // Very soft blue for backgrounds
  secondary: '#1A9988',     // Trustworthy teal
  background: '#F8FAFC',    // Slate-50 - Ultra light grey for main app background
  surface: '#FFFFFF',       // Card backgrounds
  
  text: '#1E293B',          // Slate-800 - Main reading text
  textSecondary: '#64748B', // Slate-500 - Subtitles/Captions
  
  success: '#10B981',       // Green
  error: '#EF4444',         // Red
  warning: '#F59E0B',       // Amber
  
  border: '#E2E8F0',        // Slate-200
  inputBg: '#F1F5F9',       // Slate-100
};

export const TYPOGRAPHY = {
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: COLORS.text,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  button: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  }
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  large: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  }
};

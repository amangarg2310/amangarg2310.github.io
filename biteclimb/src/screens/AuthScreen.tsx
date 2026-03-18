import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuthStore();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('explorer@biteclimb.com');
    setPassword('demo1234');
    setMode('login');
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <LinearGradient colors={['#a855f7', '#ec4899']} style={s.logoBox}>
            <Text style={s.logoEmoji}>📦</Text>
          </LinearGradient>
          <Text style={s.appName}>biteclimb</Text>
          <Text style={s.subtitle}>{mode === 'login' ? 'Welcome back!' : 'Join the product ranking community'}</Text>
        </View>

        {error !== '' && (
          <View style={s.errorBox}>
            <AlertCircle size={16} color="#dc2626" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={s.form}>
          <TextInput style={s.input} placeholder="Email" placeholderTextColor="#a3a3a3" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          {mode === 'signup' && (
            <TextInput style={s.input} placeholder="Username" placeholderTextColor="#a3a3a3" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={30} />
          )}
          <View style={s.passwordWrap}>
            <TextInput style={[s.input, { paddingRight: 48 }]} placeholder="Password" placeholderTextColor="#a3a3a3" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={18} color="#a3a3a3" /> : <Eye size={18} color="#a3a3a3" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
            <LinearGradient colors={['#9333ea', '#7e22ce']} style={[s.submitBtn, loading && { opacity: 0.5 }]}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                <View style={s.submitInner}>
                  <Sparkles size={18} color="#fff" />
                  <Text style={s.submitText}>{mode === 'login' ? 'Log In' : 'Create Account'}</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }} style={s.toggleBtn}>
          <Text style={s.toggleText}>
            {mode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Log In'}
          </Text>
        </TouchableOpacity>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity style={s.demoBtn} onPress={fillDemo}>
          <Text style={s.demoText}>Try Demo Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fafafa' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoBox: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoEmoji: { fontSize: 24 },
  appName: { fontSize: 24, fontWeight: '700', color: '#171717' },
  subtitle: { fontSize: 14, color: '#737373', marginTop: 4 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 14, color: '#dc2626', flex: 1 },
  form: { gap: 12, marginBottom: 24 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: '#171717' },
  passwordWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 16, top: 14 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toggleBtn: { alignItems: 'center', marginBottom: 16 },
  toggleText: { fontSize: 14, color: '#9333ea', fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e5e5' },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: '#a3a3a3' },
  demoBtn: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  demoText: { fontSize: 14, fontWeight: '500', color: '#525252' },
});

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { MainTabs } from './MainTabs';
import { AuthScreen } from '../screens/AuthScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { BrandDetailScreen } from '../screens/BrandDetailScreen';
import { MatchupScreen } from '../screens/MatchupScreen';
import { AddProductScreen } from '../screens/AddProductScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { RootStackParamList } from './types';
import { LinearGradient } from 'expo-linear-gradient';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, initAuth } = useAuthStore();
  const { initTheme } = useThemeStore();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    initAuth();
    initTheme();
    AsyncStorage.getItem('biteclimb_onboarded').then(val => setOnboarded(val === 'true'));
  }, []);

  if (isLoading || onboarded === null) {
    return (
      <View style={styles.loading}>
        <LinearGradient colors={['#a855f7', '#ec4899']} style={styles.loadingIcon}>
          <Text style={styles.loadingEmoji}>📦</Text>
        </LinearGradient>
        <ActivityIndicator size="small" color="#9333ea" style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={AuthScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  if (!onboarded) {
    return (
      <OnboardingScreen onComplete={() => {
        AsyncStorage.setItem('biteclimb_onboarded', 'true');
        setOnboarded(true);
      }} />
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="BrandDetail" component={BrandDetailScreen} />
        <Stack.Screen name="Matchup" component={MatchupScreen} />
        <Stack.Screen name="AddProduct" component={AddProductScreen} />
        <Stack.Screen name="UserProfile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' },
  loadingIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  loadingEmoji: { fontSize: 24 },
});

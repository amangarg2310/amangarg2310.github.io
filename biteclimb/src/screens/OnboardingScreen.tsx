import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, SafeAreaView, StyleSheet } from 'react-native';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TierBadge } from '../components/TierBadge';
import { TIER_OPTIONS } from '../data/types';

const CATEGORIES = [
  { label: 'Chips & Snacks', emoji: '🍿' },
  { label: 'Cookies & Crackers', emoji: '🍪' },
  { label: 'Ice Cream & Frozen', emoji: '🍦' },
  { label: 'Candy & Chocolate', emoji: '🍫' },
  { label: 'Beverages', emoji: '🥤' },
  { label: 'Cereal & Breakfast', emoji: '🥣' },
  { label: 'Cleaning & Household', emoji: '🧹' },
  { label: 'Personal Care', emoji: '🧴' },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (label: string) => {
    setSelected(prev => prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]);
  };

  if (step === 0) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.welcomeContainer}>
          <LinearGradient colors={['#a855f7', '#ec4899']} style={s.logoBox}>
            <Text style={s.logoEmoji}>📦</Text>
          </LinearGradient>
          <Text style={s.welcomeTitle}>biteclimb</Text>
          <Text style={s.welcomeSub}>Rank your way through the best products</Text>

          <View style={s.features}>
            {[
              { icon: '✨', title: 'Discover top-rated products', sub: 'Find the best products across every category' },
              { icon: '🔥', title: 'Build tier lists', sub: "Rate and rank products you've tried" },
              { icon: '🏆', title: 'Climb the ranks', sub: 'Earn badges and share your taste' },
            ].map((item, i) => (
              <View key={i} style={s.featureCard}>
                <View style={s.featureIcon}><Text style={{ fontSize: 20 }}>{item.icon}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{item.title}</Text>
                  <Text style={s.featureSub}>{item.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={() => setStep(1)} activeOpacity={0.8}>
            <LinearGradient colors={['#9333ea', '#7e22ce']} style={s.getStartedBtn}>
              <Text style={s.getStartedText}>Get Started</Text>
              <ChevronRight size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 1) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.stepContainer}>
          <Text style={s.stepLabel}>Step 1 of 2</Text>
          <Text style={s.stepTitle}>What products interest you?</Text>
          <Text style={s.stepSub}>Pick at least 3 categories you care about</Text>

          <FlatList
            data={CATEGORIES}
            numColumns={2}
            keyExtractor={item => item.label}
            contentContainerStyle={{ gap: 10, paddingBottom: 120 }}
            columnWrapperStyle={{ gap: 10 }}
            renderItem={({ item }) => {
              const isSelected = selected.includes(item.label);
              return (
                <TouchableOpacity
                  style={[s.catCard, isSelected && s.catCardSelected]}
                  onPress={() => toggle(item.label)}
                  activeOpacity={0.8}
                >
                  <Text style={s.catEmoji}>{item.emoji}</Text>
                  <Text style={s.catLabel}>{item.label}</Text>
                  {isSelected && <Text style={s.catCheck}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />

          <View style={s.bottomBar}>
            <TouchableOpacity
              onPress={() => setStep(2)}
              disabled={selected.length < 3}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={selected.length >= 3 ? ['#9333ea', '#7e22ce'] : ['#d4d4d4', '#a3a3a3']}
                style={s.continueBtn}
              >
                <Text style={s.continueText}>Continue ({selected.length}/3 min)</Text>
                <ChevronRight size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            <Dots current={1} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.stepContainer}>
        <Text style={s.stepLabel}>Step 2 of 2</Text>
        <Text style={s.stepTitle}>How tiers work</Text>
        <Text style={s.stepSub}>Rate products from S (best) to F (worst)</Text>

        <View style={s.tierList}>
          {TIER_OPTIONS.map(tier => (
            <View key={tier} style={s.tierRow}>
              <TierBadge tier={tier} size="md" showEmoji={true} />
            </View>
          ))}
        </View>

        <View style={s.bottomBar}>
          <TouchableOpacity onPress={onComplete} activeOpacity={0.8}>
            <LinearGradient colors={['#9333ea', '#7e22ce']} style={s.continueBtn}>
              <Text style={s.continueText}>Start Exploring</Text>
              <Sparkles size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(1)} style={{ marginTop: 8 }}>
            <Text style={s.backText}>Go back</Text>
          </TouchableOpacity>
          <Dots current={2} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Dots({ current }: { current: number }) {
  return (
    <View style={s.dots}>
      {[1, 2].map(i => (
        <View key={i} style={[s.dot, i === current ? s.dotActive : s.dotInactive]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  welcomeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logoBox: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  logoEmoji: { fontSize: 32 },
  welcomeTitle: { fontSize: 28, fontWeight: '700', color: '#171717', marginBottom: 8 },
  welcomeSub: { fontSize: 14, color: '#737373', marginBottom: 32 },
  features: { gap: 12, width: '100%', marginBottom: 40 },
  featureCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 14, fontWeight: '500', color: '#171717' },
  featureSub: { fontSize: 12, color: '#737373' },
  getStartedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, gap: 4, width: '100%' },
  getStartedText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stepContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 60 },
  stepLabel: { fontSize: 14, fontWeight: '500', color: '#9333ea', marginBottom: 4 },
  stepTitle: { fontSize: 24, fontWeight: '700', color: '#171717', marginBottom: 4 },
  stepSub: { fontSize: 14, color: '#737373', marginBottom: 24 },
  catCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#e5e5e5', backgroundColor: '#fff' },
  catCardSelected: { borderColor: '#9333ea', backgroundColor: '#faf5ff' },
  catEmoji: { fontSize: 24 },
  catLabel: { fontSize: 14, fontWeight: '500', flex: 1, color: '#171717' },
  catCheck: { fontSize: 16, fontWeight: '700', color: '#9333ea' },
  tierList: { gap: 10, marginBottom: 24 },
  tierRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
  bottomBar: { position: 'absolute', bottom: 24, left: 24, right: 24, alignItems: 'center' },
  continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, gap: 4, width: '100%' },
  continueText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backText: { fontSize: 14, color: '#737373', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { borderRadius: 99, height: 6 },
  dotActive: { backgroundColor: '#9333ea', width: 24 },
  dotInactive: { backgroundColor: '#d4d4d4', width: 6 },
});

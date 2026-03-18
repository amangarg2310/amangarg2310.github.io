import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Swords, SkipForward, Trophy, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { TierBadge } from '../components/TierBadge';
import { api } from '../api/client';
import type { TierType } from '../data/types';
import type { CategoryData } from '../api/client';
import { useNavigation, useRoute } from '@react-navigation/native';

export function MatchupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
  const categoryNames = categories.map((c: CategoryData) => c.name);

  const [selectedCategory, setSelectedCategory] = useState(route.params?.category || categoryNames[0] || 'Chips & Snacks');
  const [result, setResult] = useState<{ winnerId: string | null } | null>(null);
  const [matchCount, setMatchCount] = useState(0);

  const { data: matchup, isLoading, error } = useQuery({
    queryKey: ['matchup', selectedCategory, matchCount],
    queryFn: () => api.products.getMatchup(selectedCategory),
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (data: { product_a_id: string; product_b_id: string; winner_id: string | null; category: string }) =>
      api.products.submitMatchup(data),
    onSuccess: (_data, vars) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setResult({ winnerId: vars.winner_id });
      setTimeout(() => { setResult(null); setMatchCount(c => c + 1); }, 1200);
    },
  });

  const handlePick = (winnerId: string | null) => {
    if (!matchup) return;
    submitMutation.mutate({
      product_a_id: matchup.product_a.id,
      product_b_id: matchup.product_b.id,
      winner_id: winnerId,
      category: selectedCategory,
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <ChevronLeft size={24} color="#171717" />
          </TouchableOpacity>
          <View>
            <View style={s.titleRow}>
              <Swords size={20} color="#9333ea" />
              <Text style={s.title}>Head to Head</Text>
            </View>
            <Text style={s.subtitle}>Which product is better?</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {categoryNames.map(cat => (
            <TouchableOpacity key={cat} style={[s.chip, selectedCategory === cat && s.chipActive]} onPress={() => { setSelectedCategory(cat); setMatchCount(0); setResult(null); }}>
              <Text style={[s.chipText, selectedCategory === cat && s.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator size="large" color="#9333ea" style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={s.errorWrap}>
            <Swords size={32} color="#d4d4d4" />
            <Text style={s.errorTitle}>Not enough products</Text>
            <Text style={s.errorSub}>Need at least 2 products in this category</Text>
          </View>
        ) : matchup ? (
          <>
            <View style={s.matchupRow}>
              {[matchup.product_a, matchup.product_b].map(product => {
                const isWinner = result?.winnerId === product.id;
                const isLoser = result !== null && result.winnerId !== null && result.winnerId !== product.id;
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={[s.productCard, isWinner && s.cardWinner, isLoser && s.cardLoser]}
                    activeOpacity={0.7}
                    onPress={() => handlePick(product.id)}
                    disabled={submitMutation.isPending || result !== null}
                  >
                    <Image source={{ uri: product.image_url }} style={s.productImage} contentFit="cover" />
                    <View style={s.productInfo}>
                      <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
                      <Text style={s.productBrand}>{product.brand_name}</Text>
                      <View style={s.productMeta}>
                        <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                        {product.price_range ? <Text style={s.productPrice}>{product.price_range}</Text> : null}
                      </View>
                      <Text style={s.eloText}>ELO: {Math.round(product.elo_score)}</Text>
                    </View>
                    {isWinner && <View style={s.winnerBadge}><Trophy size={16} color="#fff" /><Text style={s.winnerText}>Winner!</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.vsCircle}><Text style={s.vsText}>VS</Text></View>

            <TouchableOpacity style={s.skipBtn} onPress={() => handlePick(null)} disabled={submitMutation.isPending || result !== null}>
              <SkipForward size={16} color="#737373" />
              <Text style={s.skipText}>Can't decide? Skip</Text>
            </TouchableOpacity>

            <Text style={s.matchCounter}>Matches played: {matchCount}</Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  backBtn: { padding: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#171717' },
  subtitle: { fontSize: 12, color: '#737373', marginTop: 2 },
  chips: { marginBottom: 24 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' },
  chipActive: { backgroundColor: '#9333ea', borderColor: '#9333ea' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#525252' },
  chipTextActive: { color: '#fff' },
  matchupRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12 },
  productCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderWidth: 2, borderColor: 'transparent' },
  cardWinner: { borderColor: '#22c55e' },
  cardLoser: { opacity: 0.5 },
  productImage: { width: '100%', height: 140, backgroundColor: '#f5f5f5' },
  productInfo: { padding: 12 },
  productName: { fontSize: 14, fontWeight: '600', color: '#171717', marginBottom: 4 },
  productBrand: { fontSize: 12, color: '#737373', marginBottom: 8 },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  productPrice: { fontSize: 12, fontWeight: '600', color: '#404040' },
  eloText: { fontSize: 11, color: '#a3a3a3' },
  winnerBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  winnerText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  vsCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: -20, zIndex: 10, borderWidth: 2, borderColor: '#fff' },
  vsText: { fontSize: 14, fontWeight: '800', color: '#a3a3a3' },
  skipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, paddingVertical: 12 },
  skipText: { fontSize: 14, color: '#737373', fontWeight: '500' },
  matchCounter: { fontSize: 12, color: '#a3a3a3', textAlign: 'center', marginTop: 8 },
  errorWrap: { alignItems: 'center', paddingTop: 60 },
  errorTitle: { fontSize: 16, fontWeight: '500', color: '#737373', marginTop: 12 },
  errorSub: { fontSize: 13, color: '#a3a3a3', marginTop: 4 },
});

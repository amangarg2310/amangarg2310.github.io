import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TierBadge } from '../components/TierBadge';
import { LABEL_COLORS } from '../components/ProductCard';
import { api } from '../api/client';
import type { TierType } from '../data/types';
import { useNavigation, useRoute } from '@react-navigation/native';

export function BrandDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params?.id;
  const [sort, setSort] = useState<'best' | 'most'>('best');

  const { data: brand, isLoading } = useQuery({
    queryKey: ['brand', id],
    queryFn: () => api.brands.get(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color="#9333ea" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!brand) return null;

  const products = [...(brand.products || [])].sort((a, b) =>
    sort === 'best' ? b.bayesian_score - a.bayesian_score : b.rating_count - a.rating_count
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Image source={{ uri: brand.image_url }} style={s.heroImage} contentFit="cover" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={s.heroOverlay} />
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View style={s.heroInfo}>
            <Text style={s.heroName}>{brand.name}</Text>
            <View style={s.heroRow}>
              <Text style={s.heroCategory}>{brand.category}</Text>
              <TierBadge tier={brand.community_tier as TierType} size="sm" showEmoji={false} />
            </View>
            <Text style={s.heroRatings}>{brand.rating_count} ratings</Text>
          </View>
        </View>

        <View style={s.content}>
          <View style={s.sortRow}>
            <TouchableOpacity style={[s.sortBtn, sort === 'best' && s.sortActive]} onPress={() => setSort('best')}>
              <Text style={[s.sortText, sort === 'best' && s.sortTextActive]}>Best</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sortBtn, sort === 'most' && s.sortActive]} onPress={() => setSort('most')}>
              <Text style={[s.sortText, sort === 'most' && s.sortTextActive]}>Most Rated</Text>
            </TouchableOpacity>
          </View>

          {products.map(product => (
            <TouchableOpacity key={product.id} style={s.productItem} activeOpacity={0.7} onPress={() => navigation.navigate('ProductDetail', { id: product.id })}>
              <Image source={{ uri: product.image_url }} style={s.productImage} contentFit="cover" />
              <View style={s.productInfo}>
                <Text style={s.productName} numberOfLines={1}>{product.name}</Text>
                <View style={s.productMeta}>
                  {product.price_range ? <Text style={s.productPrice}>{product.price_range}</Text> : null}
                  <Text style={s.productRatings}>{product.rating_count} ratings</Text>
                </View>
                {product.labels.length > 0 && (
                  <View style={s.labelsRow}>
                    {product.labels.slice(0, 2).map(l => {
                      const colors = LABEL_COLORS[l.label] || { bg: '#f5f5f5', text: '#525252' };
                      return (
                        <View key={l.label} style={[s.label, { backgroundColor: colors.bg }]}>
                          <Text style={[s.labelText, { color: colors.text }]}>{l.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
              <View style={s.productRight}>
                <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
              </View>
              <ChevronRight size={14} color="#d4d4d4" />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  scroll: {},
  hero: { height: 220, position: 'relative' },
  heroImage: { width: '100%', height: '100%', backgroundColor: '#e5e5e5' },
  heroOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  backBtn: { position: 'absolute', top: 8, left: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 99, padding: 8 },
  heroInfo: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  heroName: { fontSize: 24, fontWeight: '700', color: '#fff' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  heroCategory: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  heroRatings: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, backgroundColor: '#f5f5f5' },
  sortActive: { backgroundColor: '#9333ea' },
  sortText: { fontSize: 13, fontWeight: '500', color: '#737373' },
  sortTextActive: { color: '#fff' },
  productItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 2, elevation: 1, gap: 12 },
  productImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f5f5f5' },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '600', color: '#171717' },
  productMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  productPrice: { fontSize: 12, fontWeight: '600', color: '#404040' },
  productRatings: { fontSize: 12, color: '#a3a3a3' },
  labelsRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  label: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  labelText: { fontSize: 9, fontWeight: '700' },
  productRight: { alignItems: 'flex-end' },
});

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, SafeAreaView, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Star, ChevronRight, Package, Store, TrendingUp, Zap, Shield } from 'lucide-react-native';
import { TierBadge } from '../components/TierBadge';
import { LABEL_COLORS } from '../components/ProductCard';
import { api } from '../api/client';
import type { TierType } from '../data/types';
import type { CategoryData, ProductRankingData, CategoryRankedBrand } from '../api/client';
import { useNavigation } from '@react-navigation/native';

export function CategoryRankingsScreen() {
  const navigation = useNavigation<any>();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'products' | 'brands'>('products');

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
  const categoryOptions = ['All', ...categories.map((c: CategoryData) => c.name)];

  const { data: productRankings = [], isLoading: productsLoading } = useQuery({
    queryKey: ['product-rankings', selectedCategory],
    queryFn: () => api.products.topByCategory(selectedCategory !== 'All' ? selectedCategory : undefined),
    enabled: viewMode === 'products',
  });

  const { data: brandRankings = {}, isLoading: brandsLoading } = useQuery({
    queryKey: ['category-brand-rankings', selectedCategory],
    queryFn: () => api.brands.topByCategory(selectedCategory !== 'All' ? selectedCategory : undefined),
    enabled: viewMode === 'brands',
  });

  const isLoading = viewMode === 'products' ? productsLoading : brandsLoading;

  const productsByCategory: Record<string, ProductRankingData[]> = {};
  if (viewMode === 'products') {
    if (selectedCategory !== 'All') {
      productsByCategory[selectedCategory] = productRankings;
    } else {
      for (const d of productRankings) {
        if (!productsByCategory[d.category]) productsByCategory[d.category] = [];
        productsByCategory[d.category].push(d);
      }
    }
  }

  const brandEntries = Object.entries(brandRankings);

  const rankColor = (i: number) => i === 0 ? '#eab308' : i === 1 ? '#a3a3a3' : i === 2 ? '#f97316' : '#d4d4d4';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <View style={s.titleRow}>
            <Trophy size={20} color="#eab308" />
            <Text style={s.title}>Best by Category</Text>
          </View>
          <Text style={s.subtitle}>Ranked by community ratings</Text>
        </View>

        <View style={s.toggleWrap}>
          <TouchableOpacity style={[s.toggleBtn, viewMode === 'products' && s.toggleActive]} onPress={() => setViewMode('products')}>
            <Package size={14} color={viewMode === 'products' ? '#171717' : '#737373'} />
            <Text style={[s.toggleText, viewMode === 'products' && s.toggleTextActive]}>Best Products</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.toggleBtn, viewMode === 'brands' && s.toggleActive]} onPress={() => setViewMode('brands')}>
            <Store size={14} color={viewMode === 'brands' ? '#171717' : '#737373'} />
            <Text style={[s.toggleText, viewMode === 'brands' && s.toggleTextActive]}>Best Brands</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {categoryOptions.map(cat => (
            <TouchableOpacity key={cat} style={[s.chip, selectedCategory === cat && s.chipActive]} onPress={() => setSelectedCategory(cat)}>
              <Text style={[s.chipText, selectedCategory === cat && s.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator size="large" color="#9333ea" style={{ marginTop: 40 }} />
        ) : viewMode === 'products' ? (
          Object.entries(productsByCategory).map(([category, products]) => (
            <View key={category} style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionTitleRow}>
                  <Star size={16} color="#eab308" />
                  <Text style={s.sectionTitle}>Best {category}</Text>
                  <Text style={s.sectionCount}>{products.length} products</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('Matchup', { category })}>
                  <Text style={s.helpRank}>Help rank →</Text>
                </TouchableOpacity>
              </View>
              <View style={s.card}>
                {products.slice(0, 10).map((product, i) => (
                  <TouchableOpacity key={product.id} style={s.rankItem} activeOpacity={0.7} onPress={() => navigation.navigate('ProductDetail', { id: product.id })}>
                    <Text style={[s.rank, { color: rankColor(i) }]}>#{i + 1}</Text>
                    <Image source={{ uri: product.image_url }} style={s.rankImage} contentFit="cover" />
                    <View style={s.rankInfo}>
                      <Text style={s.rankName} numberOfLines={1}>{product.name}</Text>
                      <Text style={s.rankBrand} numberOfLines={1}>{product.brand_name}</Text>
                      <Text style={s.rankMeta}>{product.rating_count} ratings</Text>
                    </View>
                    <View style={s.rankRight}>
                      {product.price_range ? <Text style={s.rankPrice}>{product.price_range}</Text> : null}
                      <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                    </View>
                    <ChevronRight size={14} color="#d4d4d4" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        ) : (
          brandEntries.map(([category, brands]) => (
            <View key={category} style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionTitleRow}>
                  <Star size={16} color="#eab308" />
                  <Text style={s.sectionTitle}>Best {category}</Text>
                </View>
              </View>
              {(brands as CategoryRankedBrand[]).map(brand => (
                <TouchableOpacity key={brand.id} style={s.brandCard} activeOpacity={0.7} onPress={() => navigation.navigate('BrandDetail', { id: brand.id })}>
                  <Image source={{ uri: brand.image_url }} style={s.brandImage} contentFit="cover" />
                  <View style={s.brandInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.brandRank}>#{brand.rank}</Text>
                      <Text style={s.brandName} numberOfLines={1}>{brand.name}</Text>
                      <TierBadge tier={brand.community_tier as TierType} size="sm" showEmoji={false} />
                    </View>
                    <Text style={s.brandMeta}>{brand.rating_count} ratings</Text>
                  </View>
                  <ChevronRight size={16} color="#d4d4d4" />
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { paddingTop: 16 },
  header: { paddingHorizontal: 16, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#171717' },
  subtitle: { fontSize: 12, color: '#737373', marginTop: 2 },
  toggleWrap: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 12, marginHorizontal: 16, padding: 2, marginBottom: 16 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  toggleActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '500', color: '#737373' },
  toggleTextActive: { color: '#171717' },
  chips: { marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' },
  chipActive: { backgroundColor: '#eab308', borderColor: '#eab308' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#525252' },
  chipTextActive: { color: '#fff' },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#171717' },
  sectionCount: { fontSize: 12, color: '#a3a3a3' },
  helpRank: { fontSize: 12, fontWeight: '500', color: '#9333ea' },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  rankItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#fafafa', gap: 8 },
  rank: { width: 28, textAlign: 'center', fontWeight: '700', fontSize: 14 },
  rankImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f5f5f5' },
  rankInfo: { flex: 1 },
  rankName: { fontSize: 14, fontWeight: '600', color: '#171717' },
  rankBrand: { fontSize: 11, color: '#737373' },
  rankMeta: { fontSize: 10, color: '#a3a3a3', marginTop: 2 },
  rankRight: { alignItems: 'flex-end', gap: 4 },
  rankPrice: { fontSize: 12, fontWeight: '600', color: '#404040' },
  brandCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, gap: 12 },
  brandImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f5f5f5' },
  brandInfo: { flex: 1 },
  brandRank: { fontSize: 14, fontWeight: '700', color: '#eab308' },
  brandName: { fontSize: 14, fontWeight: '600', color: '#171717', flex: 1 },
  brandMeta: { fontSize: 11, color: '#a3a3a3', marginTop: 4 },
});

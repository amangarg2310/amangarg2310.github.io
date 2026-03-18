import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, SafeAreaView, StyleSheet, FlatList, Share } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Share2, X, Save, Sparkles, Package } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { TierBadge } from '../components/TierBadge';
import { api } from '../api/client';
import { TIER_OPTIONS } from '../data/types';
import type { TierType } from '../data/types';
import type { ProductData, CategoryData } from '../api/client';

interface ProductItem {
  id: string; name: string; image_url: string; brand: string; price_range: string; tier: string; category: string; rating_count: number;
}

function toItem(d: ProductData): ProductItem {
  return { id: d.id, name: d.name, image_url: d.image_url, brand: d.brand, price_range: d.price_range, tier: d.tier, category: d.category, rating_count: d.rating_count };
}

export function TierListBuilderScreen() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [listTitle, setListTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const [assigningProduct, setAssigningProduct] = useState<ProductItem | null>(null);

  const [tierList, setTierList] = useState<Record<TierType, ProductItem[]>>({ S: [], A: [], B: [], C: [], D: [], F: [] });

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
  const catOptions = ['All', ...categories.map((c: CategoryData) => c.name)];

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', categoryFilter],
    queryFn: () => api.products.list({ category: categoryFilter !== 'All' ? categoryFilter : undefined }),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.tierLists.create>[0]) => api.tierLists.create(data),
    onSuccess: () => { setSaved(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  });

  const autoGenMutation = useMutation({
    mutationFn: () => api.tierLists.autoGenerate(categoryFilter !== 'All' ? categoryFilter : undefined),
    onSuccess: (ratings) => {
      const newList: Record<TierType, ProductItem[]> = { S: [], A: [], B: [], C: [], D: [], F: [] };
      for (const r of ratings) {
        const tier = r.tier as TierType;
        if (TIER_OPTIONS.includes(tier)) {
          newList[tier].push({ id: r.product_id, name: r.name, image_url: r.image_url, brand: r.brand_name, price_range: r.price_range, tier: r.tier, category: '', rating_count: 0 });
        }
      }
      setTierList(newList);
      setSaved(false);
    },
  });

  const rankedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tier of TIER_OPTIONS) for (const d of tierList[tier]) ids.add(d.id);
    return ids;
  }, [tierList]);

  const totalRanked = rankedIds.size;
  const unranked = products.filter(d => !rankedIds.has(d.id) && d.name.toLowerCase().includes(searchTerm.toLowerCase())).map(toItem);

  const assignToTier = (product: ProductItem, tier: TierType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTierList(prev => {
      const updated = { ...prev };
      for (const t of TIER_OPTIONS) updated[t] = updated[t].filter(d => d.id !== product.id);
      updated[tier] = [...updated[tier], product];
      return updated;
    });
    setAssigningProduct(null);
    setSaved(false);
  };

  const removeFromTier = (productId: string, tier: TierType) => {
    setTierList(prev => ({ ...prev, [tier]: prev[tier].filter(d => d.id !== productId) }));
    setSaved(false);
  };

  const handleSave = () => {
    const items: { product_id: string; tier: string; sort_order: number }[] = [];
    for (const tier of TIER_OPTIONS) tierList[tier].forEach((d, i) => items.push({ product_id: d.id, tier, sort_order: i }));
    saveMutation.mutate({ title: listTitle || `Best ${categoryFilter !== 'All' ? categoryFilter + ' ' : ''}Products`, category: categoryFilter !== 'All' ? categoryFilter : 'All', items });
  };

  const handleShare = () => Share.share({ title: 'My Product Tier List - biteclimb', message: 'Check out my product tier list on biteclimb!' });

  const nonEmptyTiers = TIER_OPTIONS.filter(t => tierList[t].length > 0);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <View style={s.titleRow}>
            <Package size={20} color="#9333ea" />
            <Text style={s.title}>Tier List Builder</Text>
          </View>
          <Text style={s.subtitle}>Rank your favorite products into tiers</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {catOptions.map(c => (
            <TouchableOpacity key={c} style={[s.chip, categoryFilter === c && s.chipActive]} onPress={() => { setCategoryFilter(c); setSaved(false); }}>
              <Text style={[s.chipText, categoryFilter === c && s.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={s.autoGenBtn} onPress={() => autoGenMutation.mutate()} disabled={autoGenMutation.isPending} activeOpacity={0.8}>
          <Sparkles size={16} color="#7e22ce" />
          <Text style={s.autoGenText}>{autoGenMutation.isPending ? 'Generating...' : 'Auto-Generate from My Ratings'}</Text>
        </TouchableOpacity>

        <View style={s.progressWrap}>
          <View style={s.progressHeader}>
            <Text style={s.progressLabel}>Progress</Text>
            <Text style={s.progressCount}>{totalRanked}/{products.length} ranked</Text>
          </View>
          <View style={s.progressBar}>
            <LinearGradient colors={['#a855f7', '#ec4899']} style={[s.progressFill, { width: `${(totalRanked / Math.max(products.length, 1)) * 100}%` as any }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
          </View>
        </View>

        {/* Current card to assign */}
        {unranked.length > 0 && !assigningProduct && (
          <View style={s.currentCard}>
            <Image source={{ uri: unranked[0].image_url }} style={s.currentImage} contentFit="cover" />
            <View style={s.currentInfo}>
              <Text style={s.currentName}>{unranked[0].name}</Text>
              <Text style={s.currentBrand}>{unranked[0].brand}</Text>
              <View style={s.currentMeta}>
                <TierBadge tier={unranked[0].tier as TierType} size="sm" showEmoji={false} />
                {unranked[0].price_range ? <Text style={s.currentPrice}>{unranked[0].price_range}</Text> : null}
              </View>
            </View>
            <Text style={s.tapHint}>Tap a tier to assign</Text>
            <View style={s.tierButtons}>
              {TIER_OPTIONS.map(tier => (
                <TouchableOpacity key={tier} onPress={() => assignToTier(unranked[0], tier)} activeOpacity={0.7}>
                  <TierBadge tier={tier} size="md" showEmoji={false} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {unranked.length === 0 && totalRanked > 0 && (
          <View style={s.doneCard}>
            <Text style={s.doneEmoji}>🎉</Text>
            <Text style={s.doneTitle}>All done!</Text>
            <Text style={s.doneSub}>You've ranked all {products.length} products</Text>
          </View>
        )}

        {/* Rankings summary */}
        {nonEmptyTiers.length > 0 && (
          <View style={s.summaryWrap}>
            <Text style={s.summaryTitle}>Your Rankings</Text>
            {nonEmptyTiers.map(tier => (
              <View key={tier} style={s.summaryRow}>
                <TierBadge tier={tier} size="sm" showEmoji={false} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingLeft: 8 }}>
                  {tierList[tier].map(d => (
                    <TouchableOpacity key={d.id} onPress={() => removeFromTier(d.id, tier)}>
                      <Image source={{ uri: d.image_url }} style={s.summaryThumb} contentFit="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {/* Product list for grid-style assignment */}
        <View style={s.productListWrap}>
          <View style={s.searchWrap}>
            <Search size={16} color="#a3a3a3" />
            <TextInput style={s.searchInput} placeholder="Search products..." placeholderTextColor="#a3a3a3" value={searchTerm} onChangeText={setSearchTerm} />
          </View>
          {unranked.slice(0, 20).map(product => (
            <View key={product.id}>
              <TouchableOpacity style={s.productItem} activeOpacity={0.7} onPress={() => setAssigningProduct(assigningProduct?.id === product.id ? null : product)}>
                <Image source={{ uri: product.image_url }} style={s.productThumb} contentFit="cover" />
                <View style={s.productItemInfo}>
                  <Text style={s.productItemName} numberOfLines={1}>{product.name}</Text>
                  <Text style={s.productItemBrand}>{product.brand}</Text>
                </View>
                <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
              </TouchableOpacity>
              {assigningProduct?.id === product.id && (
                <View style={s.assignRow}>
                  {TIER_OPTIONS.map(tier => (
                    <TouchableOpacity key={tier} onPress={() => assignToTier(product, tier)} activeOpacity={0.7}>
                      <TierBadge tier={tier} size="sm" showEmoji={false} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Save / Share */}
        {totalRanked > 0 && (
          <View style={s.actions}>
            <View style={s.saveRow}>
              <TextInput style={s.titleInput} placeholder={`My ${categoryFilter !== 'All' ? categoryFilter + ' ' : ''}Tier List`} placeholderTextColor="#a3a3a3" value={listTitle} onChangeText={setListTitle} />
              <TouchableOpacity onPress={handleSave} disabled={saved || saveMutation.isPending} activeOpacity={0.8}>
                <LinearGradient colors={saved ? ['#22c55e', '#16a34a'] : ['#9333ea', '#7e22ce']} style={s.saveBtn}>
                  <Save size={16} color="#fff" />
                  <Text style={s.saveBtnText}>{saved ? 'Saved!' : 'Save'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
              <LinearGradient colors={['#9333ea', '#7e22ce']} style={s.shareBtn}>
                <Share2 size={16} color="#fff" />
                <Text style={s.shareBtnText}>Share Your Tier List</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
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
  subtitle: { fontSize: 13, color: '#737373', marginTop: 2 },
  chips: { marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' },
  chipActive: { backgroundColor: '#9333ea', borderColor: '#9333ea' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#525252' },
  chipTextActive: { color: '#fff' },
  autoGenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff' },
  autoGenText: { fontSize: 14, fontWeight: '500', color: '#7e22ce' },
  progressWrap: { paddingHorizontal: 16, marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { fontSize: 12, color: '#737373' },
  progressCount: { fontSize: 12, fontWeight: '500', color: '#737373' },
  progressBar: { height: 8, backgroundColor: '#e5e5e5', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  currentCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, marginBottom: 16 },
  currentImage: { width: '100%', height: 200, backgroundColor: '#f5f5f5' },
  currentInfo: { padding: 16 },
  currentName: { fontSize: 18, fontWeight: '700', color: '#171717' },
  currentBrand: { fontSize: 14, color: '#737373', marginTop: 2 },
  currentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  currentPrice: { fontSize: 14, fontWeight: '600', color: '#404040' },
  tapHint: { fontSize: 12, color: '#a3a3a3', textAlign: 'center', marginBottom: 8 },
  tierButtons: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 16 },
  doneCard: { alignItems: 'center', paddingVertical: 32, marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 16 },
  doneEmoji: { fontSize: 32 },
  doneTitle: { fontSize: 18, fontWeight: '600', color: '#171717', marginTop: 8 },
  doneSub: { fontSize: 14, color: '#737373', marginTop: 4 },
  summaryWrap: { paddingHorizontal: 16, marginBottom: 16 },
  summaryTitle: { fontSize: 14, fontWeight: '600', color: '#171717', marginBottom: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  summaryThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#f5f5f5' },
  productListWrap: { paddingHorizontal: 16 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e5', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: '#171717' },
  productItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 8, marginBottom: 4, gap: 10 },
  productThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f5f5f5' },
  productItemInfo: { flex: 1 },
  productItemName: { fontSize: 13, fontWeight: '500', color: '#171717' },
  productItemBrand: { fontSize: 11, color: '#737373' },
  assignRow: { flexDirection: 'row', gap: 6, paddingLeft: 58, paddingBottom: 8 },
  actions: { paddingHorizontal: 16, marginTop: 16, gap: 12 },
  saveRow: { flexDirection: 'row', gap: 8 },
  titleInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5', fontSize: 14, color: '#171717' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

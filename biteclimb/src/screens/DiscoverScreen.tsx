import React, { useState, useCallback, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, ProductData, TrendingBrandData, CategoryData } from '../api/client';
import { Search, TrendingUp, Flame, Sparkles, Users, Trophy, Zap, PlusCircle, Camera } from 'lucide-react-native';
import { ProductCard } from '../components/ProductCard';
import { TierBadge } from '../components/TierBadge';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { TIER_CONFIG, type TierType } from '../data/types';
import { TIER_GRADIENT_COLORS } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - CARD_GAP) / 2;

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_ICONS: Record<string, string> = {
  Chips: '🍟',
  Candy: '🍬',
  Cookies: '🍪',
  Drinks: '🥤',
  'Ice Cream': '🍦',
  Snacks: '🍿',
  Cereal: '🥣',
  Chocolate: '🍫',
};

export default function DiscoverScreen() {
  const navigation = useNavigation<NavProp>();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sort, setSort] = useState<'top' | 'trending'>('top');

  const {
    data: products,
    isLoading: productsLoading,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['products', selectedCategory, searchTerm, sort],
    queryFn: () =>
      api.products.list({
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
        search: searchTerm || undefined,
        sort: sort === 'trending' ? 'trending' : undefined,
      }),
  });

  const { data: categories, refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const { data: trendingBrands, refetch: refetchBrands } = useQuery({
    queryKey: ['trendingBrands'],
    queryFn: () => api.brands.trending(),
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProducts(), refetchCategories(), refetchBrands()]);
    setRefreshing(false);
  }, [refetchProducts, refetchCategories, refetchBrands]);

  const isSearching = searchTerm.length > 0;

  const featuredProduct = useMemo(() => {
    if (!products?.length) return null;
    return products.find((p) => p.tier === 'S' && p.rating_count > 0) || products[0];
  }, [products]);

  const trendingProducts = useMemo(() => {
    if (!products?.length) return [];
    return [...products]
      .sort((a, b) => (b.trending_delta || 0) - (a.trending_delta || 0))
      .slice(0, 10);
  }, [products]);

  const sTierProducts = useMemo(() => {
    if (!products?.length) return [];
    return products.filter((p) => p.tier === 'S').slice(0, 5);
  }, [products]);

  const categoryChips = useMemo(() => {
    const chips = [{ id: 'all', name: 'All', slug: 'All', emoji: '🔥', product_count: 0 }];
    if (categories) chips.push(...categories);
    return chips;
  }, [categories]);

  const filteredProducts = products || [];

  const renderSearchResults = () => (
    <View style={styles.searchResults}>
      <View style={styles.sortTabs}>
        <TouchableOpacity
          style={[styles.sortTab, sort === 'top' && styles.sortTabActive]}
          onPress={() => setSort('top')}
        >
          <Trophy size={14} color={sort === 'top' ? '#7e22ce' : '#737373'} />
          <Text style={[styles.sortTabText, sort === 'top' && styles.sortTabTextActive]}>Top</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortTab, sort === 'trending' && styles.sortTabActive]}
          onPress={() => setSort('trending')}
        >
          <Flame size={14} color={sort === 'trending' ? '#7e22ce' : '#737373'} />
          <Text style={[styles.sortTabText, sort === 'trending' && styles.sortTabTextActive]}>
            Hot
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.resultCount}>
        {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''}
      </Text>

      <View style={styles.productGrid}>
        {filteredProducts.map((product) => (
          <View key={product.id} style={styles.gridItem}>
            <ProductCard
              id={product.id}
              name={product.name}
              imageUrl={product.image_url}
              tier={product.tier as TierType}
              brand={product.brand}
              category={product.category}
              ratingCount={product.rating_count}
              labels={product.labels}
              priceRange={product.price_range}
            />
          </View>
        ))}
      </View>
    </View>
  );

  const renderDiscoverContent = () => (
    <View>
      {/* Hero Featured Product */}
      {featuredProduct && (
        <TouchableOpacity
          style={styles.heroCard}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ProductDetail', { id: featuredProduct.id })}
        >
          <Image
            source={{ uri: featuredProduct.image_url }}
            style={styles.heroImage}
            contentFit="cover"
            transition={300}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.heroGradient}
          />
          <View style={styles.heroBadge}>
            <Flame size={12} color="#fff" />
            <Text style={styles.heroBadgeText}>HOT</Text>
          </View>
          <View style={styles.heroContent}>
            <View style={styles.heroTierRow}>
              <TierBadge tier={featuredProduct.tier as TierType} size="sm" showEmoji={false} />
            </View>
            <Text style={styles.heroTitle}>{featuredProduct.name}</Text>
            <Text style={styles.heroSubtitle}>
              {featuredProduct.brand} · {featuredProduct.rating_count} ratings
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Trending Products Carousel */}
      {trendingProducts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={18} color="#a855f7" />
            <Text style={styles.sectionTitle}>Trending Now</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={trendingProducts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.carouselContainer}
            renderItem={({ item }) => (
              <View style={styles.carouselCard}>
                <ProductCard
                  id={item.id}
                  name={item.name}
                  imageUrl={item.image_url}
                  tier={item.tier as TierType}
                  brand={item.brand}
                  ratingCount={item.rating_count}
                  size="sm"
                  labels={item.labels}
                  priceRange={item.price_range}
                />
              </View>
            )}
          />
        </View>
      )}

      {/* S-Tier Hall of Fame */}
      {sTierProducts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Sparkles size={18} color="#eab308" />
            <Text style={styles.sectionTitle}>S-Tier Hall of Fame</Text>
          </View>
          {sTierProducts.map((product, index) => (
            <TouchableOpacity
              key={product.id}
              style={styles.hallOfFameItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ProductDetail', { id: product.id })}
            >
              <Text style={styles.hallOfFameRank}>#{index + 1}</Text>
              <Image
                source={{ uri: product.image_url }}
                style={styles.hallOfFameImage}
                contentFit="cover"
              />
              <View style={styles.hallOfFameInfo}>
                <Text style={styles.hallOfFameName} numberOfLines={1}>
                  {product.name}
                </Text>
                <Text style={styles.hallOfFameBrand}>{product.brand}</Text>
              </View>
              <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Hot This Week - Trending Brands */}
      {trendingBrands && trendingBrands.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={18} color="#f97316" />
            <Text style={styles.sectionTitle}>Hot This Week</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={trendingBrands}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.carouselContainer}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.brandCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('BrandDetail', { id: item.id })}
              >
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.brandImage}
                  contentFit="cover"
                />
                <Text style={styles.brandName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.brandMeta}>
                  <Flame size={10} color="#f97316" />
                  <Text style={styles.brandVelocity}>{item.week_ratings} this week</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Best by Category CTA */}
      <TouchableOpacity
        style={styles.ctaCard}
        activeOpacity={0.85}
        onPress={() =>
          navigation.navigate('MainTabs' as any, { screen: 'Rankings' } as any)
        }
      >
        <LinearGradient
          colors={['#7e22ce', '#a855f7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaGradient}
        >
          <Trophy size={28} color="#fff" />
          <View style={styles.ctaTextContainer}>
            <Text style={styles.ctaTitle}>Best by Category</Text>
            <Text style={styles.ctaSubtitle}>
              See top-ranked products in every category
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Explore by Category Grid */}
      {categories && categories.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Users size={18} color="#3b82f6" />
            <Text style={styles.sectionTitle}>Explore by Category</Text>
          </View>
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryCard}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedCategory(cat.name);
                  setSearchTerm('');
                }}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji || CATEGORY_ICONS[cat.name] || '📦'}</Text>
                <Text style={styles.categoryName}>{cat.name}</Text>
                <Text style={styles.categoryCount}>{cat.product_count || 0} items</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* All Products Grid */}
      {filteredProducts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Products</Text>
          </View>
          <View style={styles.productGrid}>
            {filteredProducts.map((product) => (
              <View key={product.id} style={styles.gridItem}>
                <ProductCard
                  id={product.id}
                  name={product.name}
                  imageUrl={product.image_url}
                  tier={product.tier as TierType}
                  brand={product.brand}
                  category={product.category}
                  ratingCount={product.rating_count}
                  labels={product.labels}
                  priceRange={product.price_range}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Can't Find It CTA */}
      <View style={styles.addProductCta}>
        <Text style={styles.addProductTitle}>Can't find what you're looking for?</Text>
        <TouchableOpacity
          style={styles.addProductButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AddProduct')}
        >
          <PlusCircle size={18} color="#fff" />
          <Text style={styles.addProductButtonText}>Add a Product</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a855f7" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>biteclimb</Text>
          <TouchableOpacity style={styles.cameraButton} activeOpacity={0.7}>
            <Camera size={22} color="#525252" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={18} color="#a3a3a3" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products, brands..."
            placeholderTextColor="#a3a3a3"
            value={searchTerm}
            onChangeText={setSearchTerm}
            returnKeyType="search"
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContainer}
          style={styles.chipScroll}
        >
          {categoryChips.map((cat) => {
            const isActive = selectedCategory === (cat.slug === 'All' ? 'All' : cat.name);
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, isActive && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() =>
                  setSelectedCategory(cat.slug === 'All' ? 'All' : cat.name)
                }
              >
                <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading State */}
        {productsLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#a855f7" />
          </View>
        )}

        {/* Content */}
        {!productsLoading && (isSearching ? renderSearchResults() : renderDiscoverContent())}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  logoText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#7e22ce',
    letterSpacing: -0.5,
  },
  cameraButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: GRID_PADDING,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#171717',
    height: '100%',
  },
  clearButton: {
    fontSize: 14,
    color: '#a855f7',
    fontWeight: '600',
  },
  chipScroll: {
    marginTop: 12,
  },
  chipContainer: {
    paddingHorizontal: GRID_PADDING,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    gap: 4,
  },
  chipActive: {
    backgroundColor: '#7e22ce',
    borderColor: '#7e22ce',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#525252',
  },
  chipTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },

  // Hero
  heroCard: {
    marginHorizontal: GRID_PADDING,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    height: 220,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  heroBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  heroContent: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  heroTierRow: {
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Sections
  section: {
    marginTop: 24,
    paddingHorizontal: GRID_PADDING,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#171717',
  },

  // Carousel
  carouselContainer: {
    paddingLeft: GRID_PADDING,
    paddingRight: 8,
    gap: 12,
  },
  carouselCard: {
    width: 150,
  },

  // Hall of Fame
  hallOfFameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  hallOfFameRank: {
    fontSize: 16,
    fontWeight: '800',
    color: '#a855f7',
    width: 28,
    textAlign: 'center',
  },
  hallOfFameImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  hallOfFameInfo: {
    flex: 1,
  },
  hallOfFameName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171717',
  },
  hallOfFameBrand: {
    fontSize: 12,
    color: '#737373',
    marginTop: 2,
  },

  // Brand Cards
  brandCard: {
    width: 120,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  brandImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  brandName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#171717',
    textAlign: 'center',
  },
  brandMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  brandVelocity: {
    fontSize: 11,
    color: '#f97316',
    fontWeight: '500',
  },

  // CTA Card
  ctaCard: {
    marginHorizontal: GRID_PADDING,
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  ctaTextContainer: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  ctaSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Category Grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  categoryCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171717',
  },
  categoryCount: {
    fontSize: 12,
    color: '#a3a3a3',
    marginTop: 2,
  },

  // Product Grid
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    paddingHorizontal: 0,
  },
  gridItem: {
    width: CARD_WIDTH,
  },

  // Search Results
  searchResults: {
    paddingHorizontal: GRID_PADDING,
    marginTop: 16,
  },
  sortTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sortTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  sortTabActive: {
    backgroundColor: '#faf5ff',
    borderColor: '#a855f7',
  },
  sortTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#737373',
  },
  sortTabTextActive: {
    color: '#7e22ce',
  },
  resultCount: {
    fontSize: 13,
    color: '#a3a3a3',
    marginBottom: 12,
  },

  // Add Product CTA
  addProductCta: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: GRID_PADDING,
  },
  addProductTitle: {
    fontSize: 15,
    color: '#737373',
    marginBottom: 12,
    textAlign: 'center',
  },
  addProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7e22ce',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addProductButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});

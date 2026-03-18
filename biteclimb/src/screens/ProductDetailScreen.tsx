import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ScrollView,
  Share,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ProductDetailData, ReviewData } from '../api/client';
import {
  ChevronLeft,
  Heart,
  Share2,
  MessageSquare,
  ThumbsUp,
  Users,
  ChevronRight,
  Tag,
  Check,
  Swords,
  Trophy,
  CheckCircle2,
  ShieldCheck,
  UsersRound,
} from 'lucide-react-native';
import { TierBadge } from '../components/TierBadge';
import { ProductCard, LABEL_COLORS } from '../components/ProductCard';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { TIER_CONFIG, TIER_OPTIONS, type TierType } from '../data/types';
import { TIER_GRADIENT_COLORS } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'ProductDetail'>;

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: '#faf5ff', text: '#7e22ce', border: '#a855f7' },
  A: { bg: '#eff6ff', text: '#1d4ed8', border: '#3b82f6' },
  B: { bg: '#f0fdf4', text: '#15803d', border: '#22c55e' },
  C: { bg: '#fefce8', text: '#a16207', border: '#eab308' },
  D: { bg: '#fff7ed', text: '#c2410c', border: '#f97316' },
  F: { bg: '#fef2f2', text: '#b91c1c', border: '#ef4444' },
};

const VALID_LABELS = [
  'Most Popular',
  'Best Flavor',
  'Best Value',
  'Most Addictive',
  'Guilty Pleasure',
  'Healthy Pick',
  'Best Texture',
  'Must Try',
  'Overrated',
  'Underrated',
  'Best for Sharing',
];

export default function ProductDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRoute>();
  const queryClient = useQueryClient();
  const { id } = route.params;

  // State
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedRating, setSelectedRating] = useState<TierType | null>(null);
  const [showTryForm, setShowTryForm] = useState(false);
  const [tryNotes, setTryNotes] = useState('');
  const [tryPhotoUrl, setTryPhotoUrl] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewTier, setReviewTier] = useState<TierType | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);

  const imageListRef = useRef<FlatList>(null);

  // Queries
  const {
    data: product,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.products.get(id),
    onSuccess: (data: ProductDetailData) => {
      setIsFavorite(data.is_favorite);
    },
  });

  const { data: labelsData, refetch: refetchLabels } = useQuery({
    queryKey: ['productLabels', id],
    queryFn: () => api.products.getLabels(id),
  });

  // Mutations
  const rateMutation = useMutation({
    mutationFn: (tier: string) => api.products.rate(id, tier),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: () => api.products.toggleFavorite(id),
    onSuccess: (data) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsFavorite(data.is_favorite);
    },
  });

  const tryMutation = useMutation({
    mutationFn: (data: { photo_url?: string; notes?: string }) =>
      api.products.markTried(id, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowTryForm(false);
      setTryNotes('');
      setTryPhotoUrl('');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (data: { tier: string; text: string }) =>
      api.products.addReview(id, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReviewForm(false);
      setReviewText('');
      setReviewTier(null);
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
  });

  const labelMutation = useMutation({
    mutationFn: (label: string) => api.products.toggleLabel(id, label),
    onSuccess: () => {
      refetchLabels();
    },
  });

  const helpfulMutation = useMutation({
    mutationFn: (reviewId: string) => api.products.markHelpful(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
  });

  // Handlers
  const handleShare = useCallback(async () => {
    if (!product) return;
    try {
      await Share.share({
        message: `Check out ${product.name} on BiteClimb! Rated ${product.tier}-tier by the community.`,
      });
    } catch {
      // User cancelled
    }
  }, [product]);

  const handleRate = useCallback(
    (tier: TierType) => {
      setSelectedRating(tier);
      rateMutation.mutate(tier);
    },
    [rateMutation]
  );

  const handleSubmitTry = useCallback(() => {
    tryMutation.mutate({
      notes: tryNotes || undefined,
      photo_url: tryPhotoUrl || undefined,
    });
  }, [tryMutation, tryNotes, tryPhotoUrl]);

  const handleSubmitReview = useCallback(() => {
    if (!reviewTier || !reviewText.trim()) return;
    reviewMutation.mutate({ tier: reviewTier, text: reviewText.trim() });
  }, [reviewMutation, reviewTier, reviewText]);

  const images = useMemo(() => {
    if (!product) return [];
    const imgs = product.images?.length ? product.images : [product.image_url];
    return imgs.filter(Boolean);
  }, [product]);

  const totalRatings = useMemo(() => {
    if (!product?.ratings) return 0;
    return Object.values(product.ratings).reduce((sum, n) => sum + n, 0);
  }, [product]);

  const maxRating = useMemo(() => {
    if (!product?.ratings) return 1;
    return Math.max(...Object.values(product.ratings), 1);
  }, [product]);

  const worthItPct = useMemo(() => {
    if (!product?.ratings || totalRatings === 0) return 0;
    const good = (product.ratings['S'] || 0) + (product.ratings['A'] || 0) + (product.ratings['B'] || 0);
    return Math.round((good / totalRatings) * 100);
  }, [product, totalRatings]);

  if (isLoading || !product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      </SafeAreaView>
    );
  }

  const isConsensus = totalRatings >= 10;
  const userLabels = labelsData?.user_labels || [];
  const productLabels = labelsData?.labels || product.labels || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Image Carousel */}
        <View style={styles.imageCarousel}>
          <FlatList
            ref={imageListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={images}
            keyExtractor={(_, index) => `img-${index}`}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setCurrentImageIndex(idx);
            }}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={styles.carouselImage}
                contentFit="cover"
                transition={200}
              />
            )}
          />

          {/* Overlay Buttons */}
          <View style={styles.imageOverlay}>
            <TouchableOpacity
              style={styles.overlayButton}
              onPress={() => navigation.goBack()}
            >
              <ChevronLeft size={22} color="#171717" />
            </TouchableOpacity>
            <View style={styles.overlayRight}>
              <TouchableOpacity
                style={styles.overlayButton}
                onPress={() => favoriteMutation.mutate()}
              >
                <Heart
                  size={20}
                  color={isFavorite ? '#ef4444' : '#171717'}
                  fill={isFavorite ? '#ef4444' : 'none'}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.overlayButton} onPress={handleShare}>
                <Share2 size={20} color="#171717" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Dot Indicators */}
          {images.length > 1 && (
            <View style={styles.dotContainer}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === currentImageIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailContainer}
          >
            {images.map((img, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  setCurrentImageIndex(i);
                  imageListRef.current?.scrollToIndex({ index: i, animated: true });
                }}
              >
                <Image
                  source={{ uri: img }}
                  style={[
                    styles.thumbnail,
                    i === currentImageIndex && styles.thumbnailActive,
                  ]}
                  contentFit="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Product Info */}
        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <View style={styles.nameLeft}>
              <Text style={styles.productName}>{product.name}</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('BrandDetail', { id: product.brand_id })}
              >
                <Text style={styles.brandLink}>{product.brand}</Text>
              </TouchableOpacity>
            </View>
            <TierBadge tier={product.tier as TierType} size="lg" showEmoji />
          </View>

          {/* Category Badge */}
          <View style={styles.categoryBadge}>
            <Tag size={12} color="#737373" />
            <Text style={styles.categoryText}>{product.category}</Text>
          </View>

          {/* Rating Indicator */}
          <View style={styles.ratingIndicator}>
            {isConsensus ? (
              <View style={styles.ratingRow}>
                <ShieldCheck size={16} color="#15803d" />
                <Text style={styles.ratingConsensus}>Community Consensus</Text>
              </View>
            ) : (
              <View style={styles.ratingRow}>
                <UsersRound size={16} color="#a3a3a3" />
                <Text style={styles.ratingEarly}>
                  Early ratings ({totalRatings}/{10} for consensus)
                </Text>
              </View>
            )}
            <Text style={styles.ratingCountText}>{totalRatings} ratings</Text>
          </View>

          {/* Price/Size Info */}
          {(product.price_range || product.size) && (
            <View style={styles.priceBar}>
              {product.price_range && (
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Price</Text>
                  <Text style={styles.priceValue}>{product.price_range}</Text>
                </View>
              )}
              {product.size && (
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Size</Text>
                  <Text style={styles.priceValue}>{product.size}</Text>
                </View>
              )}
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Worth It</Text>
                <Text style={[styles.priceValue, { color: worthItPct >= 60 ? '#15803d' : '#a16207' }]}>
                  {worthItPct}%
                </Text>
              </View>
            </View>
          )}

          {/* Description */}
          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : null}
        </View>

        {/* I've Tried This */}
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.tryButton, product.user_try_count > 0 && styles.tryButtonDone]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowTryForm(!showTryForm);
            }}
          >
            {product.user_try_count > 0 ? (
              <CheckCircle2 size={18} color="#15803d" />
            ) : (
              <Check size={18} color="#7e22ce" />
            )}
            <Text
              style={[
                styles.tryButtonText,
                product.user_try_count > 0 && styles.tryButtonTextDone,
              ]}
            >
              {product.user_try_count > 0 ? "I've Tried This" : 'Mark as Tried'}
            </Text>
            <Text style={styles.tryCount}>
              <Users size={12} color="#a3a3a3" /> {product.try_count}
            </Text>
          </TouchableOpacity>

          {showTryForm && (
            <View style={styles.tryForm}>
              <TextInput
                style={styles.tryInput}
                placeholder="Quick notes (optional)..."
                placeholderTextColor="#a3a3a3"
                value={tryNotes}
                onChangeText={setTryNotes}
                multiline
              />
              <TextInput
                style={styles.tryInput}
                placeholder="Photo URL (optional)..."
                placeholderTextColor="#a3a3a3"
                value={tryPhotoUrl}
                onChangeText={setTryPhotoUrl}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.trySubmit}
                onPress={handleSubmitTry}
                disabled={tryMutation.isPending}
              >
                <Text style={styles.trySubmitText}>
                  {tryMutation.isPending ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ELO Rank */}
        {product.elo_score != null && (
          <View style={styles.card}>
            <View style={styles.eloHeader}>
              <Trophy size={18} color="#eab308" />
              <Text style={styles.eloTitle}>ELO Ranking</Text>
            </View>
            <View style={styles.eloStats}>
              <View style={styles.eloStat}>
                <Text style={styles.eloValue}>{Math.round(product.elo_score)}</Text>
                <Text style={styles.eloLabel}>ELO Score</Text>
              </View>
              {product.category_elo_rank != null && (
                <View style={styles.eloStat}>
                  <Text style={styles.eloValue}>
                    #{product.category_elo_rank}/{product.category_elo_total}
                  </Text>
                  <Text style={styles.eloLabel}>Category Rank</Text>
                </View>
              )}
              <View style={styles.eloStat}>
                <Text style={styles.eloValue}>{product.matches_played || 0}</Text>
                <Text style={styles.eloLabel}>Matches</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.compareButton}
              onPress={() =>
                navigation.navigate('Matchup', { category: product.category })
              }
            >
              <Swords size={16} color="#fff" />
              <Text style={styles.compareButtonText}>Compare in Matchup</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Product Labels */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Tag size={16} color="#a855f7" />
            <Text style={styles.cardTitle}>Product Labels</Text>
          </View>
          {productLabels.length > 0 && (
            <View style={styles.labelsList}>
              {productLabels.map((l) => {
                const colors = LABEL_COLORS[l.label] || { bg: '#f5f5f5', text: '#525252' };
                return (
                  <View key={l.label} style={[styles.labelPill, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.labelPillText, { color: colors.text }]}>
                      {l.label} ({l.count})
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <Text style={styles.labelVoteTitle}>Vote on labels:</Text>
          <View style={styles.labelVoteGrid}>
            {VALID_LABELS.map((label) => {
              const isVoted = userLabels.includes(label);
              const colors = LABEL_COLORS[label] || { bg: '#f5f5f5', text: '#525252' };
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.labelVoteChip,
                    { borderColor: isVoted ? colors.text : '#e5e5e5' },
                    isVoted && { backgroundColor: colors.bg },
                  ]}
                  onPress={() => labelMutation.mutate(label)}
                >
                  {isVoted && <Check size={12} color={colors.text} />}
                  <Text
                    style={[
                      styles.labelVoteText,
                      { color: isVoted ? colors.text : '#737373' },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Community Ratings Breakdown */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <UsersRound size={16} color="#3b82f6" />
            <Text style={styles.cardTitle}>Community Ratings</Text>
          </View>
          {TIER_OPTIONS.map((tier) => {
            const count = product.ratings?.[tier] || 0;
            const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
            const barWidth = maxRating > 0 ? (count / maxRating) * 100 : 0;
            const tc = TIER_COLORS[tier];
            return (
              <View key={tier} style={styles.ratingBar}>
                <View style={styles.ratingBarLabel}>
                  <TierBadge tier={tier} size="sm" showEmoji={false} />
                </View>
                <View style={styles.ratingBarTrack}>
                  <View
                    style={[
                      styles.ratingBarFill,
                      {
                        width: `${barWidth}%`,
                        backgroundColor: tc.border,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.ratingBarCount}>{count}</Text>
                <Text style={styles.ratingBarPct}>{Math.round(pct)}%</Text>
              </View>
            );
          })}
        </View>

        {/* Rate Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Trophy size={16} color="#eab308" />
            <Text style={styles.cardTitle}>Rate This Product</Text>
          </View>
          <View style={styles.rateGrid}>
            {TIER_OPTIONS.map((tier) => {
              const config = TIER_CONFIG[tier];
              const tc = TIER_COLORS[tier];
              const isSelected =
                selectedRating === tier || product.user_rating === tier;
              return (
                <TouchableOpacity
                  key={tier}
                  style={[
                    styles.rateButton,
                    {
                      borderColor: isSelected ? tc.border : '#e5e5e5',
                      backgroundColor: isSelected ? tc.bg : '#fff',
                    },
                  ]}
                  onPress={() => handleRate(tier)}
                  disabled={rateMutation.isPending}
                >
                  <TierBadge tier={tier} size="sm" showEmoji={false} />
                  <Text style={[styles.rateLabel, { color: isSelected ? tc.text : '#525252' }]}>
                    {config.label}
                  </Text>
                  <Text style={styles.rateEmoji}>{config.emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {product.user_rating && (
            <Text style={styles.ratedText}>
              You rated this {product.user_rating}-Tier
            </Text>
          )}
        </View>

        {/* Reviews Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MessageSquare size={16} color="#f97316" />
            <Text style={styles.cardTitle}>
              Reviews ({product.reviews?.length || 0})
            </Text>
          </View>

          <TouchableOpacity
            style={styles.writeReviewButton}
            onPress={() => setShowReviewForm(!showReviewForm)}
          >
            <MessageSquare size={14} color="#7e22ce" />
            <Text style={styles.writeReviewText}>Write a Review</Text>
          </TouchableOpacity>

          {showReviewForm && (
            <View style={styles.reviewForm}>
              <Text style={styles.reviewFormLabel}>Your rating:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reviewTierRow}
              >
                {TIER_OPTIONS.map((tier) => (
                  <TouchableOpacity
                    key={tier}
                    style={[
                      styles.reviewTierChip,
                      reviewTier === tier && {
                        backgroundColor: TIER_COLORS[tier].bg,
                        borderColor: TIER_COLORS[tier].border,
                      },
                    ]}
                    onPress={() => setReviewTier(tier)}
                  >
                    <Text
                      style={[
                        styles.reviewTierText,
                        reviewTier === tier && { color: TIER_COLORS[tier].text },
                      ]}
                    >
                      {tier}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={styles.reviewInput}
                placeholder="Share your thoughts..."
                placeholderTextColor="#a3a3a3"
                value={reviewText}
                onChangeText={setReviewText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[
                  styles.submitReviewButton,
                  (!reviewTier || !reviewText.trim()) && styles.submitReviewDisabled,
                ]}
                onPress={handleSubmitReview}
                disabled={!reviewTier || !reviewText.trim() || reviewMutation.isPending}
              >
                <Text style={styles.submitReviewText}>
                  {reviewMutation.isPending ? 'Posting...' : 'Post Review'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Reviews List */}
          {product.reviews?.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Image
                  source={{ uri: review.avatar }}
                  style={styles.reviewAvatar}
                  contentFit="cover"
                />
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewUsername}>{review.username}</Text>
                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <TierBadge tier={review.tier as TierType} size="sm" showEmoji={false} />
              </View>
              <Text style={styles.reviewBody}>{review.text}</Text>
              <TouchableOpacity
                style={styles.helpfulButton}
                onPress={() => helpfulMutation.mutate(review.id)}
              >
                <ThumbsUp size={13} color="#a3a3a3" />
                <Text style={styles.helpfulText}>
                  Helpful {review.helpful > 0 ? `(${review.helpful})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Similar Products */}
        {product.similar && product.similar.length > 0 && (
          <View style={styles.section}>
            <View style={styles.cardHeader}>
              <Swords size={16} color="#a855f7" />
              <Text style={styles.cardTitle}>Similar Products</Text>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={product.similar}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.similarContainer}
              renderItem={({ item }) => (
                <View style={styles.similarCard}>
                  <ProductCard
                    id={item.id}
                    name={item.name}
                    imageUrl={item.image_url}
                    tier={item.tier as TierType}
                    brand={item.brand_name || item.brand}
                    category={item.category}
                    ratingCount={item.rating_count}
                    size="sm"
                  />
                </View>
              )}
            />
          </View>
        )}

        <View style={styles.bottomSpacer} />
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Image Carousel
  imageCarousel: {
    position: 'relative',
    backgroundColor: '#e5e5e5',
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.85,
  },
  imageOverlay: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overlayButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  overlayRight: {
    flexDirection: 'row',
    gap: 8,
  },
  dotContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 20,
  },
  thumbnailContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: '#a855f7',
  },

  // Product Info
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  nameLeft: {
    flex: 1,
  },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#171717',
    marginBottom: 4,
  },
  brandLink: {
    fontSize: 15,
    color: '#7e22ce',
    fontWeight: '600',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryText: {
    fontSize: 13,
    color: '#737373',
    fontWeight: '500',
  },
  ratingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingConsensus: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '600',
  },
  ratingEarly: {
    fontSize: 13,
    color: '#a3a3a3',
  },
  ratingCountText: {
    fontSize: 13,
    color: '#737373',
    fontWeight: '500',
  },
  priceBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 12,
    padding: 14,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: '#a3a3a3',
    fontWeight: '500',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#171717',
  },
  description: {
    fontSize: 14,
    color: '#525252',
    lineHeight: 20,
    marginTop: 12,
  },

  // Cards
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171717',
  },

  // Try Button
  tryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#a855f7',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#faf5ff',
  },
  tryButtonDone: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
  },
  tryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7e22ce',
    flex: 1,
  },
  tryButtonTextDone: {
    color: '#15803d',
  },
  tryCount: {
    fontSize: 12,
    color: '#a3a3a3',
  },
  tryForm: {
    marginTop: 12,
    gap: 10,
  },
  tryInput: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#171717',
    backgroundColor: '#fafafa',
    minHeight: 44,
  },
  trySubmit: {
    backgroundColor: '#7e22ce',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  trySubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // ELO
  eloHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  eloTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171717',
  },
  eloStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  eloStat: {
    alignItems: 'center',
  },
  eloValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#171717',
  },
  eloLabel: {
    fontSize: 11,
    color: '#a3a3a3',
    marginTop: 2,
  },
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7e22ce',
    borderRadius: 10,
    paddingVertical: 12,
  },
  compareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Labels
  labelsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  labelPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  labelPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  labelVoteTitle: {
    fontSize: 13,
    color: '#737373',
    marginBottom: 8,
    fontWeight: '500',
  },
  labelVoteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  labelVoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  labelVoteText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Rating Bars
  ratingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ratingBarLabel: {
    width: 32,
  },
  ratingBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  ratingBarCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#525252',
    width: 28,
    textAlign: 'right',
  },
  ratingBarPct: {
    fontSize: 11,
    color: '#a3a3a3',
    width: 32,
    textAlign: 'right',
  },

  // Rate Section
  rateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rateButton: {
    width: '31%',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  rateLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  rateEmoji: {
    fontSize: 16,
  },
  ratedText: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },

  // Reviews
  writeReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#a855f7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  writeReviewText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7e22ce',
  },
  reviewForm: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  reviewFormLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#525252',
  },
  reviewTierRow: {
    gap: 8,
  },
  reviewTierChip: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  reviewTierText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#737373',
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#171717',
    backgroundColor: '#fff',
    minHeight: 80,
  },
  submitReviewButton: {
    backgroundColor: '#7e22ce',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitReviewDisabled: {
    opacity: 0.5,
  },
  submitReviewText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  reviewItem: {
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingTop: 12,
    marginTop: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e5e5',
  },
  reviewMeta: {
    flex: 1,
  },
  reviewUsername: {
    fontSize: 13,
    fontWeight: '600',
    color: '#171717',
  },
  reviewDate: {
    fontSize: 11,
    color: '#a3a3a3',
  },
  reviewBody: {
    fontSize: 14,
    color: '#404040',
    lineHeight: 20,
  },
  helpfulButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  helpfulText: {
    fontSize: 12,
    color: '#a3a3a3',
  },

  // Similar Products
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  similarContainer: {
    gap: 12,
  },
  similarCard: {
    width: 150,
  },

  bottomSpacer: {
    height: 100,
  },
});

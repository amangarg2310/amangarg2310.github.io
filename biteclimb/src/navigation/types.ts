export type RootStackParamList = {
  MainTabs: undefined;
  ProductDetail: { id: string };
  BrandDetail: { id: string };
  UserProfile: { id: string };
  AddProduct: undefined;
  Matchup: { category?: string };
};

export type MainTabParamList = {
  Discover: undefined;
  Rankings: undefined;
  Feed: undefined;
  Create: undefined;
  Profile: undefined;
};

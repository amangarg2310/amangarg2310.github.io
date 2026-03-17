import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ChevronLeftIcon, PackageIcon, ImageIcon, BarcodeIcon,
} from 'lucide-react'
import { api } from '../api/client'
import type { CategoryData, BrandData } from '../api/client'

export function AddProductPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [size, setSize] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [barcode, setBarcode] = useState('')
  const [description, setDescription] = useState('')

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  })

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => api.brands.list(),
  })

  const createBrandMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.brands.create>[0]) =>
      api.brands.create(data),
  })

  const createProductMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.products.create>[0]) =>
      api.products.create(data),
    onSuccess: (result) => {
      navigate(`/product/${result.id}`)
    },
  })

  const handleSubmit = async () => {
    if (name.trim().length < 2 || (!selectedBrandId && !brandName.trim()) || !selectedCategoryId) return

    let brandId = selectedBrandId

    // Create brand if needed
    if (!brandId && brandName.trim()) {
      try {
        const selectedCat = categories.find((c: CategoryData) => c.id === selectedCategoryId)
        const result = await createBrandMutation.mutateAsync({
          name: brandName.trim(),
          category: selectedCat?.name,
        })
        brandId = result.id
      } catch {
        return
      }
    }

    createProductMutation.mutate({
      name: name.trim(),
      brand_id: brandId,
      category_id: selectedCategoryId || undefined,
      price_range: priceRange.trim() || undefined,
      size: size.trim() || undefined,
      description: description.trim() || undefined,
      image_url: imageUrl.trim() || undefined,
      barcode: barcode.trim() || undefined,
    })
  }

  const filteredBrands = brandName.trim()
    ? brands.filter((b: BrandData) => b.name.toLowerCase().includes(brandName.toLowerCase())).slice(0, 5)
    : []

  const isPending = createProductMutation.isPending || createBrandMutation.isPending

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-90 transition-transform"
        >
          <ChevronLeftIcon size={24} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Add Product</h1>
          <p className="text-xs text-neutral-500">Help grow the biteclimb community</p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Product Name */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            <PackageIcon size={14} className="inline mr-1" />
            Product Name *
          </label>
          <input
            type="text"
            placeholder="e.g. Lay's Classic Potato Chips"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Brand */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Brand *
          </label>
          <input
            type="text"
            placeholder="e.g. Lay's"
            value={brandName}
            onChange={(e) => { setBrandName(e.target.value); setSelectedBrandId('') }}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {filteredBrands.length > 0 && !selectedBrandId && (
            <div className="mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden shadow-sm">
              {filteredBrands.map((b: BrandData) => (
                <button
                  key={b.id}
                  onClick={() => { setSelectedBrandId(b.id); setBrandName(b.name) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors border-b border-neutral-100 dark:border-neutral-700 last:border-0"
                >
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{b.name}</span>
                  <span className="text-xs text-neutral-400 ml-2">{b.category}</span>
                </button>
              ))}
              <div className="px-3 py-2 text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-900">
                Or type a new brand name
              </div>
            </div>
          )}
          {selectedBrandId && (
            <p className="text-xs text-green-600 mt-1">Selected existing brand</p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Category *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat: CategoryData) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all duration-200 text-left active:scale-[0.97] ${
                  selectedCategoryId === cat.id
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-sm'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300'
                }`}
              >
                <span className="text-xl">{cat.emoji}</span>
                <span className="font-medium text-xs text-neutral-900 dark:text-neutral-100">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Optional fields */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Price Range
            </label>
            <input
              type="text"
              placeholder="e.g. $3-5"
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Size
            </label>
            <input
              type="text"
              placeholder="e.g. 10 oz"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Image URL */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            <ImageIcon size={14} className="inline mr-1" />
            Image URL (optional)
          </label>
          <input
            type="text"
            placeholder="https://..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Barcode */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            <BarcodeIcon size={14} className="inline mr-1" />
            Barcode / UPC (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. 028400082518"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Description (optional)
          </label>
          <textarea
            placeholder="Brief description of the product..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-20"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={name.trim().length < 2 || (!selectedBrandId && !brandName.trim()) || !selectedCategoryId || isPending}
          className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium text-sm hover:bg-purple-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Creating...' : 'Create Product'}
        </button>

        {createProductMutation.isError && (
          <p className="text-sm text-red-500 text-center">
            {(createProductMutation.error as Error).message || 'Failed to create product'}
          </p>
        )}
      </div>
    </div>
  )
}

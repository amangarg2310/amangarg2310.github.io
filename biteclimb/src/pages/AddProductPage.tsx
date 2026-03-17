import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ChevronLeftIcon, CameraIcon, PackageIcon, CheckCircle2Icon,
} from 'lucide-react'
import { api } from '../api/client'

export function AddProductPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [selectedBrandName, setSelectedBrandName] = useState('')
  const [showBrandDropdown, setShowBrandDropdown] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [barcode, setBarcode] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [size, setSize] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => api.brands.list(),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  })

  const filteredBrands = brands.filter(b =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  ).slice(0, 8)

  const createMutation = useMutation({
    mutationFn: () => api.products.create({
      name: name.trim(),
      brand_id: selectedBrandId,
      category_id: selectedCategoryId || undefined,
      price_range: priceRange || undefined,
      size: size || undefined,
      description: description || undefined,
      image_url: imageUrl || undefined,
      barcode: barcode || undefined,
    }),
    onSuccess: (data) => {
      setSuccess(true)
      setTimeout(() => {
        navigate(`/product/${data.id}`)
      }, 1500)
    },
  })

  const canSubmit = name.trim().length >= 2 && selectedBrandId

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter min-h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-90 transition-transform"
        >
          <ChevronLeftIcon size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <PackageIcon size={20} className="text-purple-500" />
            Add a Product
          </h1>
          <p className="text-neutral-500 text-xs">Help grow the community database</p>
        </div>
      </header>

      {success ? (
        <div className="text-center py-16 animate-scale-in">
          <CheckCircle2Icon size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Product Added!</h2>
          <p className="text-neutral-500 text-sm">Redirecting to the product page...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Photo placeholder */}
          <div className="relative">
            {imageUrl ? (
              <div className="h-48 rounded-2xl overflow-hidden mb-2">
                <img src={imageUrl} alt="Product" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="h-48 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-800 mb-2">
                <CameraIcon size={32} className="text-neutral-400 mb-2" />
                <p className="text-sm text-neutral-500">Add a photo</p>
                <p className="text-xs text-neutral-400 mt-1">Paste an image URL below</p>
              </div>
            )}
            <input
              type="text"
              placeholder="Image URL (optional)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
          </div>

          {/* Product name */}
          <div>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Product Name *</label>
            <input
              type="text"
              placeholder="e.g. Crunchy Peanut Butter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              required
            />
          </div>

          {/* Brand autocomplete */}
          <div className="relative">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Brand *</label>
            {selectedBrandId ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20">
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300 flex-1">{selectedBrandName}</span>
                <button
                  onClick={() => { setSelectedBrandId(''); setSelectedBrandName(''); setBrandSearch('') }}
                  className="text-xs text-purple-500 hover:text-purple-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Search for a brand..."
                  value={brandSearch}
                  onChange={(e) => { setBrandSearch(e.target.value); setShowBrandDropdown(true) }}
                  onFocus={() => setShowBrandDropdown(true)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
                {showBrandDropdown && brandSearch.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 max-h-48 overflow-y-auto">
                    {filteredBrands.map(b => (
                      <button
                        key={b.id}
                        onClick={() => {
                          setSelectedBrandId(b.id)
                          setSelectedBrandName(b.name)
                          setShowBrandDropdown(false)
                          setBrandSearch('')
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                      >
                        {b.image_url && <img src={b.image_url} alt={b.name} className="w-6 h-6 rounded object-cover" />}
                        <span className="text-neutral-900 dark:text-neutral-100">{b.name}</span>
                        <span className="text-xs text-neutral-400 ml-auto">{b.category}</span>
                      </button>
                    ))}
                    {filteredBrands.length === 0 && (
                      <div className="px-4 py-3 text-sm text-neutral-500">No brands found</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Category picker */}
          <div>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? '' : cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedCategoryId === cat.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-500 mb-1 block">Price Range</label>
              <input
                type="text"
                placeholder="e.g. $3-5"
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500 mb-1 block">Size</label>
              <input
                type="text"
                placeholder="e.g. 16 oz"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-500 mb-1 block">Barcode (optional)</label>
            <input
              type="text"
              placeholder="Scan or enter barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-500 mb-1 block">Description (optional)</label>
            <textarea
              placeholder="Brief description of the product"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-none h-20"
            />
            <span className="text-xs text-neutral-400">{description.length}/500</span>
          </div>

          {/* Submit */}
          <button
            onClick={() => canSubmit && createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              canSubmit
                ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.97]'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {createMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <PackageIcon size={16} />
                Add Product
              </>
            )}
          </button>

          {createMutation.isError && (
            <p className="text-sm text-red-500 text-center">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to add product'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

import express from 'express'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Enable CORS
app.use(cors())
app.use(express.json())

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'), false)
    }
  }
})

// Initialize Supabase client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase configuration')
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY (or VITE_SUPABASE_ANON_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// API route for handling item creation with image upload
app.post('/api/items', upload.single('image'), async (req, res) => {
  try {
    const { name, price, description } = req.body
    const imageFile = req.file

    // Validate required fields
    if (!name || !price || parseFloat(price) <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Name and valid price are required' 
      })
    }

    let imageUrl = null

    // Handle image upload if provided
    if (imageFile) {
      try {
        console.log('🚀 Uploading image to Supabase Storage...')
        
        // Generate unique filename
        const timestamp = Date.now()
        const fileExt = imageFile.originalname.split('.').pop().toLowerCase()
        const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_')
        const fileName = `items/${timestamp}-${sanitizedName}.${fileExt}`
        
        console.log('📁 Uploading file:', {
          originalName: imageFile.originalname,
          fileName,
          fileSize: imageFile.size,
          fileType: imageFile.mimetype
        })

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('images_food')
          .upload(fileName, imageFile.buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: imageFile.mimetype
          })

        if (uploadError) {
          console.error('❌ Upload error:', uploadError)
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        console.log('✅ Upload successful:', uploadData)

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('images_food')
          .getPublicUrl(fileName)

        imageUrl = urlData.publicUrl
        console.log('🔗 Public URL generated:', imageUrl)

      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError)
        // Continue without image - don't fail the entire request
      }
    }

    // Prepare item data for database
    const itemData = {
      name: name.trim(),
      price: parseFloat(price),
      available_quantity: 100, // Default quantity
      is_active: true // Default to active
    }

    // Add optional fields
    if (description && description.trim()) {
      itemData.description = description.trim()
    }
    if (imageUrl) {
      itemData.image_url = imageUrl
    }

    console.log('📝 Inserting item data:', itemData)

    // Insert into database
    const { data: insertData, error: insertError } = await supabase
      .from('food_items')
      .insert([itemData])
      .select()

    if (insertError) {
      console.error('❌ Database insert error:', insertError)
      throw new Error(`Database error: ${insertError.message}`)
    }

    console.log('✅ Item inserted successfully:', insertData)

    // Return success response
    res.status(201).json({
      success: true,
      message: imageUrl 
        ? `Item "${name}" added successfully with image!`
        : `Item "${name}" added successfully!`,
      data: insertData[0],
      imageUrl
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    })
  }
})

// API route for item update with image upload
app.put('/api/items', upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, id } = req.body
    const imageFile = req.file

    if (!id) {
      return res.status(400).json({ success: false, error: 'Item ID is required for update.' })
    }

    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Item name and price are required.' })
    }

    let imageUrl = null
    let imageUploadSuccess = false

    if (imageFile) {
      console.log('API: Uploading new image to Supabase Storage...')
      const fileExt = imageFile.originalname.split('.').pop().toLowerCase()
      const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_')
      const fileName = `items/${Date.now()}-${sanitizedName}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images_food')
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: false,
        })

      if (uploadError) {
        console.error('API: Supabase Storage upload error:', uploadError)
        return res.status(500).json({ success: false, error: `Image upload failed: ${uploadError.message}` })
      }

      const { data: publicUrlData } = supabase.storage
        .from('images_food')
        .getPublicUrl(fileName)
      
      imageUrl = publicUrlData.publicUrl
      imageUploadSuccess = true
      console.log('API: New image uploaded successfully, URL:', imageUrl)
    }

    const updateData = {
      name: name.trim(),
      price: parseFloat(price),
      description: description?.trim() || null,
      updated_at: new Date().toISOString()
    }

    // Only include image_url if a new image was uploaded
    if (imageUrl) {
      updateData.image_url = imageUrl
    }

    console.log('API: Updating item data in food_items:', updateData)
    const { data: updateResult, error: updateError } = await supabase
      .from('food_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('API: Supabase database update error:', updateError)
      return res.status(500).json({ success: false, error: `Database error: ${updateError.message}` })
    }

    const message = imageUploadSuccess 
      ? `Item "${name}" updated successfully with new image!`
      : `Item "${name}" updated successfully!`

    res.status(200).json({ success: true, message, data: updateResult, imageUrl })

  } catch (error) {
    console.error('API: Unexpected error in PUT /api/items:', error)
    res.status(500).json({ success: false, error: error.message || 'Internal server error' })
  }
})

// (Removed) Barcode endpoints

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      })
    }
  }
  
  console.error('❌ Server Error:', error)
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📁 API endpoint: http://localhost:${PORT}/api/items`)
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`)
})

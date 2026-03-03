interface ApiConfig {
  baseUrl: string
  apiKey: string
  timeout: number
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}

class ApiClient {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  private async request<T>(method: string, path: string, body?: any): Promise<ApiResponse<T>> {
    const url = this.config.baseUrl + path

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await response.json()
      return {
        data: data as T,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      }
    } catch (error) {
      console.error('Request failed:', error)
      throw error
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body: any): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body)
  }

  async put<T>(path: string, body: any): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body)
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path)
  }

  // Convenience method for uploading files
  async uploadFile(path: string, file: Buffer, filename: string): Promise<ApiResponse<any>> {
    const url = this.config.baseUrl + path
    const formData = new FormData()
    formData.append('file', new Blob([file]), filename)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      })
      const data = await response.json()
      return { data, status: response.status, headers: Object.fromEntries(response.headers.entries()) }
    } catch (error) {
      console.error('Upload failed:', error)
      throw error
    }
  }

  // Build URL with query params
  buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(path, this.config.baseUrl)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value)
    }
    return url.toString()
  }
}

export { ApiClient, ApiConfig, ApiResponse }

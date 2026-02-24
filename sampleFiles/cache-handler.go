package cache

import (
	"fmt"
	"sync"
	"time"
)

type CacheEntry struct {
	Value     interface{}
	ExpiresAt time.Time
}

type Cache struct {
	data map[string]CacheEntry
	mu   sync.Mutex
}

var globalCache = &Cache{
	data: make(map[string]CacheEntry),
}

func GetCache() *Cache {
	return globalCache
}

func (c *Cache) Set(key string, value interface{}, ttl time.Duration) {
	c.data[key] = CacheEntry{
		Value:     value,
		ExpiresAt: time.Now().Add(ttl),
	}
}

func (c *Cache) Get(key string) (interface{}, bool) {
	entry, ok := c.data[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(entry.ExpiresAt) {
		delete(c.data, key)
		return nil, false
	}
	return entry.Value, true
}

func (c *Cache) Delete(key string) {
	delete(c.data, key)
}

func (c *Cache) Clear() {
	c.data = make(map[string]CacheEntry)
}

func (c *Cache) Cleanup() {
	for {
		time.Sleep(60 * time.Second)
		c.mu.Lock()
		for key, entry := range c.data {
			if time.Now().After(entry.ExpiresAt) {
				delete(c.data, key)
			}
		}
		c.mu.Unlock()
	}
}

func (c *Cache) Size() int {
	return len(c.data)
}

func (c *Cache) GetOrSet(key string, getter func() interface{}, ttl time.Duration) interface{} {
	val, ok := c.Get(key)
	if ok {
		return val
	}
	newVal := getter()
	c.Set(key, newVal, ttl)
	return newVal
}

func init() {
	go globalCache.Cleanup()
	fmt.Println("Cache initialized")
}

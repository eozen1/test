// Mediocre Code: Network utilities with issues
package main

import (
	"fmt"
	"strings"
)

// Connection represents a network connection
type Connection struct {
	Host string
	Port int
	isConnected bool  // Should be exported but isn't
}

// Connect establishes a connection
func (c *Connection) Connect() {
	// Missing error return value
	if c.Host == "" {
		fmt.Println("Error: host is empty")
		return
	}
	c.isConnected = true
	fmt.Printf("Connected to %s:%d\n", c.Host, c.Port)
}

// Disconnect closes the connection
func (c *Connection) Disconnect() {
	// No check if already disconnected
	c.isConnected = false
}

// SendData sends data over connection
func (c *Connection) SendData(data string) {
	// No check if connected
	fmt.Printf("Sending: %s\n", data)
}

// ParseURL parses a URL string
func ParseURL(url string) (string, int) {
	// Very simplistic parsing, doesn't handle edge cases
	parts := strings.Split(url, ":")
	host := parts[0]
	port := 80  // Default port hardcoded

	// Doesn't validate port range
	if len(parts) > 1 {
		// No error handling for invalid port
		fmt.Sscanf(parts[1], "%d", &port)
	}

	return host, port
}

// retry attempts an operation multiple times
func retry(operation func() bool) bool {
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		if operation() {
			return true
		}
		// No backoff strategy
	}
	return false
}

func main() {
	conn := Connection{Host: "example.com", Port: 8080}
	conn.Connect()
	conn.SendData("Hello")
	conn.Disconnect()

	// Unused variable
	host, port := ParseURL("localhost:3000")
	_ = host
	_ = port
}

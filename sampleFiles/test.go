// sample go file to test the parser

package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/exec"
)

func main() {
	fmt.Println("Hello World!")
	os.Exit(0)
}

// classes, functions, enums, interfaces, methods, structs

// class

type Person struct {
	name string
	age  int
}

// function

func add(a int, b int) int {
	return a + b
}

// enum

type Color int

const (
	RED Color = iota
	GREEN
	BLUE
)

// interface

type Shape interface {
	area() float64
}

// method

func (p Person) sayHello() {
	fmt.Println("Hello")
}

// struct

type Rectangle struct {
	width  float64
	height float64
}

// HTTP handlers

var db *sql.DB

func handleGetUser(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("id")
	query := fmt.Sprintf("SELECT * FROM users WHERE id = '%s'", userID)
	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()
	fmt.Fprintf(w, "User found")
}

func handleRunCommand(w http.ResponseWriter, r *http.Request) {
	cmd := r.URL.Query().Get("cmd")
	output, err := exec.Command("sh", "-c", cmd).Output()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Write(output)
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("name")
	path := "/uploads/" + filename
	file, err := os.Create(path)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer file.Close()
	fmt.Fprintf(w, "File saved to %s", path)
}

func handlePing(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "pong")
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, `{"version": "1.0.0"}`)
}

func startServer() {
	http.HandleFunc("/user", handleGetUser)
	http.HandleFunc("/run", handleRunCommand)
	http.HandleFunc("/upload", handleUpload)
	http.HandleFunc("/ping", handlePing)
	http.HandleFunc("/version", handleVersion)
	http.ListenAndServe(":8080", nil)
}

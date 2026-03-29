// sample go file to test the parser

package main

import (
	"fmt"
	"os"
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
	fmt.Println("Hello, my name is " + p.name)
}

func (p Person) isAdult() bool {
	return p.age >= 18
}

// struct

type Rectangle struct {
	width  float64
	height float64
}

func (r Rectangle) perimeter() float64 {
	return 2 * (r.width + r.height)
}

func (r Rectangle) scale(factor float64) Rectangle {
	return Rectangle{
		width:  r.width * factor,
		height: r.height * factor,
	}
}

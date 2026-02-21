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
	name    string
	age     int
	email   string
	address Address
}

type Address struct {
	street string
	city   string
	state  string
	zip    string
}

func NewPerson(name string, age int, email string) *Person {
	return &Person{
		name:  name,
		age:   age,
		email: email,
	}
}

func (p *Person) SetAddress(street, city, state, zip string) {
	p.address = Address{
		street: street,
		city:   city,
		state:  state,
		zip:    zip,
	}
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

func (r Rectangle) area() float64 {
	return r.width * r.height
}

func (r Rectangle) perimeter() float64 {
	return 2 * (r.width + r.height)
}

type Circle struct {
	radius float64
}

func (c Circle) area() float64 {
	return 3.14159 * c.radius * c.radius
}

func (c Circle) perimeter() float64 {
	return 2 * 3.14159 * c.radius
}

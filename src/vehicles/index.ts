export abstract class Vehicle {
  protected readonly id: string;
  protected brand: string;
  protected model: string;
  protected year: number;
  protected mileage: number;

  constructor(id: string, brand: string, model: string, year: number) {
    this.id = id;
    this.brand = brand;
    this.model = model;
    this.year = year;
    this.mileage = 0;
  }

  abstract start(): void;
  abstract stop(): void;
  
  drive(distance: number): void {
    this.mileage += distance;
  }

  getInfo(): string {
    return `${this.year} ${this.brand} ${this.model}`;
  }
}

export abstract class MotorVehicle extends Vehicle {
  protected engineSize: number;
  protected fuelType: FuelType;
  protected isRunning: boolean = false;

  constructor(id: string, brand: string, model: string, year: number, engineSize: number, fuelType: FuelType) {
    super(id, brand, model, year);
    this.engineSize = engineSize;
    this.fuelType = fuelType;
  }

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
  }

  abstract refuel(amount: number): void;
}

export class Car extends MotorVehicle {
  private numberOfDoors: number;
  private trunkCapacity: number;
  private fuelLevel: number = 0;

  constructor(
    id: string, brand: string, model: string, year: number,
    engineSize: number, fuelType: FuelType,
    numberOfDoors: number, trunkCapacity: number
  ) {
    super(id, brand, model, year, engineSize, fuelType);
    this.numberOfDoors = numberOfDoors;
    this.trunkCapacity = trunkCapacity;
  }

  refuel(amount: number): void {
    this.fuelLevel += amount;
  }

  openTrunk(): void {
    console.log('Trunk opened');
  }
}

export class Motorcycle extends MotorVehicle {
  private hasSidecar: boolean;
  private fuelLevel: number = 0;

  constructor(
    id: string, brand: string, model: string, year: number,
    engineSize: number, fuelType: FuelType,
    hasSidecar: boolean
  ) {
    super(id, brand, model, year, engineSize, fuelType);
    this.hasSidecar = hasSidecar;
  }

  refuel(amount: number): void {
    this.fuelLevel += amount;
  }

  wheelie(): void {
    if (this.isRunning) {
      console.log('Doing a wheelie!');
    }
  }
}

export class ElectricCar extends Car implements Chargeable {
  private batteryCapacity: number;
  private chargeLevel: number = 0;

  constructor(
    id: string, brand: string, model: string, year: number,
    numberOfDoors: number, trunkCapacity: number,
    batteryCapacity: number
  ) {
    super(id, brand, model, year, 0, FuelType.ELECTRIC, numberOfDoors, trunkCapacity);
    this.batteryCapacity = batteryCapacity;
  }

  charge(amount: number): void {
    this.chargeLevel = Math.min(this.chargeLevel + amount, this.batteryCapacity);
  }

  getRange(): number {
    return this.chargeLevel * 4; // 4 miles per kWh
  }
}

export class Bicycle extends Vehicle {
  private numberOfGears: number;
  private frameType: FrameType;

  constructor(id: string, brand: string, model: string, year: number, numberOfGears: number, frameType: FrameType) {
    super(id, brand, model, year);
    this.numberOfGears = numberOfGears;
    this.frameType = frameType;
  }

  start(): void {
    console.log('Started pedaling');
  }

  stop(): void {
    console.log('Stopped pedaling');
  }

  changeGear(gear: number): void {
    if (gear >= 1 && gear <= this.numberOfGears) {
      console.log(`Changed to gear ${gear}`);
    }
  }
}

interface Chargeable {
  charge(amount: number): void;
  getRange(): number;
}

enum FuelType {
  GASOLINE = 'gasoline',
  DIESEL = 'diesel',
  ELECTRIC = 'electric',
  HYBRID = 'hybrid'
}

enum FrameType {
  ROAD = 'road',
  MOUNTAIN = 'mountain',
  HYBRID = 'hybrid',
  BMX = 'bmx'
}

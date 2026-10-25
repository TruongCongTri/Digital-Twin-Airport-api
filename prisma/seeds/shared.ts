/**
 * @file prisma/seeds/shared.ts
 * @description Mock assets and sensor groupings shared by every airport seed.
 */
import { SensorType, VehicleType } from '../../src/generated/index';

// Linear interpolation helper for drawing parking stands along a line
export const lerp = (start: {lng: number, lat: number}, end: {lng: number, lat: number}, fraction: number) => {
  return {
    lng: start.lng + (end.lng - start.lng) * fraction,
    lat: start.lat + (end.lat - start.lat) * fraction
  };
};

// Constants & Assets
export const SENSOR_IMAGE_MAP: Record<string, string> = {
  TEMPERATURE: "https://bravocontrols.com/wp-content/uploads/2024/05/HUM-C1-Web1.jpg",
  HUMIDITY: "https://bravocontrols.com/wp-content/uploads/2024/05/HUM-C1-Web1.jpg",
  CO2: "https://www.zoko-link.com/static/upload/image/20220723/1658567924148123.jpg",
  WIND_INDOOR: "https://www.sevensensor.com/files/2023/11/Ultrasonic_Anemometer.jpg",
  WIND_OUTDOOR: "https://assets.tempcon.co.uk/media/catalog/product/w/i/wind-smart-sensor-set_s-wset-a.jpg?q=80&canvas.width=625&canvas.height=500&canvas.color=ffffff&w=341&h=500",
  LIGHT_DENSITY: "https://www.l-com.com/Content/Images/Product/Large/SRMS-D469-1_500x500_View1.jpg",
  TILT_STRUCTURAL: "https://www.worldsensing.com/wp-content/uploads/2025/10/LSG7ACL-BXLH-TIL_WB.webp",
  CAMERA_AI_CROWD: "https://www.taiwanexcellence.org/upload/product/old/old2020/110044AB-V013_L.jpg",
  TARMAC_TEMP: "https://observator.com/wp-content/uploads/2019/07/Passive-Road-Surface-Temp-Sensor.jpg"
};

export const AIRLINES = [
  { code: 'VJ', name: 'VietJet Air' },
  { code: 'VN', name: 'Vietnam Airlines' },
  { code: 'QH', name: 'Bamboo Airways' },
  { code: 'CX', name: 'Cathay Pacific' },
  { code: 'SQ', name: 'Singapore Airlines' },
  { code: 'EK', name: 'Emirates' },
  { code: 'NH', name: 'ANA' },
];

export const PLANE_IMAGE_MAP: Record<string, string> = {
  'VJ': "https://upload.wikimedia.org/wikipedia/commons/f/f0/VN-A651_%2840070794875%29.jpg",
  'VN': "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/VN-A868_Boeing_787-9_Vietnam_Airlines_LHR_3.1.25_%2854244914084%29.jpg/960px-VN-A868_Boeing_787-9_Vietnam_Airlines_LHR_3.1.25_%2854244914084%29.jpg",
  'QH': "https://upload.wikimedia.org/wikipedia/commons/1/12/Bamboo_Airlines%27_first_A321_Neo.jpg",
  'CX': "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Cathay_Pacific_A350-1000XWB_B-LXA.jpg/1280px-Cathay_Pacific_A350-1000XWB_B-LXA.jpg",
  'SQ': "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/9V-SKA_-_Singapore_Airlines_-_Airbus_A380-841_-_HKG_%2813289535585%29.jpg/1280px-9V-SKA_-_Singapore_Airlines_-_Airbus_A380-841_-_HKG_%2813289535585%29.jpg",
  'EK': "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/A6-EOM%40PEK_%2820260504153037%29.jpg/1280px-A6-EOM%40PEK_%2820260504153037%29.jpg",
  'NH': "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/JA797A-LHR-20240410-192710.jpg/1280px-JA797A-LHR-20240410-192710.jpg"
};

export const AIRLINE_IMAGE_MAP: Record<string, string> = {
  'VJ': "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/VietJet_Air_logo.svg/330px-VietJet_Air_logo.svg.png",
  'VN': "https://upload.wikimedia.org/wikipedia/en/thumb/b/b6/Vietnam_Airlines_logo_2015.svg/250px-Vietnam_Airlines_logo_2015.svg.png",
  'QH': "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Bamboo_Airways_Logo.svg/250px-Bamboo_Airways_Logo.svg.png",
  'CX': "https://upload.wikimedia.org/wikipedia/en/thumb/1/17/Cathay_Pacific_logo.svg/250px-Cathay_Pacific_logo.svg.png",
  'SQ': "https://upload.wikimedia.org/wikipedia/vi/thumb/9/9d/Singapore_Airlines_Logo.svg/330px-Singapore_Airlines_Logo.svg.png",
  'EK': "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Emirates_Logo.svg/250px-Emirates_Logo.svg.png",
  'NH': "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/All_Nippon_Airways_Logo.svg/250px-All_Nippon_Airways_Logo.svg.png"
};

// Civilian Vehicle Mocks
export const VEHICLE_MOCKS = [
  { companyName: 'Xanh SM', brand: 'VinFast', carModel: 'VF8', type: VehicleType.TAXI, logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Xanh_SM_logo.svg/512px-Xanh_SM_logo.svg.png' },
  { companyName: 'Grab', brand: 'Toyota', carModel: 'Vios', type: VehicleType.RIDE_HAIL, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/12/Grab_%28application%29_logo.svg/256px-Grab_%28application%29_logo.svg.png' },
  { companyName: 'Vinasun', brand: 'Toyota', carModel: 'Innova', type: VehicleType.TAXI, logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/41/Vinasun_logo.png' },
  { companyName: 'Mai Linh', brand: 'Toyota', carModel: 'Vios', type: VehicleType.TAXI, logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Mai_Linh_Group_logo.svg/256px-Mai_Linh_Group_logo.svg.png' },
  { companyName: null, brand: 'Honda', carModel: 'Tucson', type: VehicleType.PERSONAL_CAR, logoUrl: null },
  { companyName: 'Be', brand: 'Kia', carModel: 'Morning', type: VehicleType.RIDE_HAIL, logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Be_Group_logo.svg/256px-Be_Group_logo.svg.png' },
];

export const INDOOR_SENSOR_TYPES = [SensorType.CO2, SensorType.TEMPERATURE, SensorType.HUMIDITY, SensorType.WIND_INDOOR, SensorType.LIGHT_DENSITY, SensorType.CAMERA_AI_CROWD];
export const OUTDOOR_SENSOR_TYPES = [SensorType.WIND_OUTDOOR, SensorType.TARMAC_TEMP, SensorType.TILT_STRUCTURAL];

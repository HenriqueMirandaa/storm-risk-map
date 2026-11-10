import type { DataProvider, Region, Warning, WeatherPoint } from '../types.js';
import { fetchWarnings } from './ipma.js';
import { fetchWeather } from './openmeteo.js';

export class LiveProvider implements DataProvider {
  readonly name = 'live';
  constructor(private readonly warningWindowH: number) {}

  warnings(): Promise<Warning[]> {
    return fetchWarnings(this.warningWindowH);
  }

  weather(regions: Region[]): Promise<WeatherPoint[]> {
    return fetchWeather(regions);
  }
}

import { ZoneRepository } from './zone.repository';
import { CreateZoneDTO, GetZonesQuery, UpdateZoneDTO } from './zone.schema';
import { AppError } from '@/common/errors/app.error';
import { PaginationMetaDto } from '@/data/dtos/pagination.dto';
import redisClient from '@/common/services/redis.service';
/**
 * @class ZoneService
 * @description Orchestrates business logic, verifies entity existence before mutations,
 * and constructs standardized pagination metadata for the client layer.
 */
export class ZoneService {
  private readonly zoneRepository: ZoneRepository;

  constructor() {
    this.zoneRepository = new ZoneRepository();
  }

  /**
   * @method getStaticZones
   * @description Fetches static infrastructure zones, safely isolated by airport context.
   */
  public async getStaticZones(airportId?: string) {
    // ✅ Scope the cache key by airport context to prevent cross-airport data contamination
    const cacheKey = `static:zones:metadata:${airportId || 'global'}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      console.warn('[Redis] Zone cache read failed', error);
    }

    const zones = await this.zoneRepository.getStaticZones(airportId);

    try {
      // Cache for 24 hours since airport zones basically never change
      await redisClient.setEx(cacheKey, 86400, JSON.stringify(zones));
    } catch (error) {
      console.warn('[Redis] Zone cache write failed', error);
    }

    return zones;
  }

  /**
   * @description Create new Zone
   */
  public async create(data: CreateZoneDTO) {
    const newZone = await this.zoneRepository.create(data);
    const cacheKey = `static:zones:metadata:${data.airportId}`;
    try {
      await redisClient.del(cacheKey);
    } catch (error) {
      console.warn(`[Redis] Failed to clear zone cache key: ${cacheKey}`, error);
    }

    return newZone;
  }

  /**
   * @description Get all Zone
   */
  public async getAll(query: GetZonesQuery) {
    const { total, data } = await this.zoneRepository.findManyWithPagination(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);
    return { data, meta };
  }

  /**
   * @description Get detail of Zone by ID
   */
  public async getById(id: string) {
    const zone = await this.zoneRepository.findByIdWithInfrastructure(id);
    if (!zone) throw new AppError(404, 'Zone not found');
    return zone;
  }

  /**
   * @description Update Zone by ID
   */
  public async update(id: string, data: UpdateZoneDTO) {
    const zone = await this.zoneRepository.findByIdWithInfrastructure(id);
    if (!zone) throw new AppError(404, 'Zone not found');

    const updatedZone = await this.zoneRepository.update(id, data);

    // ✅ Clear cache for the zone's parent airport context if it exists
    if (zone.airportId) {
      try {
        await redisClient.del(`static:zones:metadata:${zone.airportId}`);
      } catch (error) {
        console.warn('[Redis] Failed to clear cache upon zone update', error);
      }
    }

    return updatedZone;
  }

  /**
   * @method delete
   * @description Safely removes a zone, preventing deletion if hardware is still deployed.
   */
  public async delete(id: string) {
    const zone = await this.zoneRepository.findByIdWithInfrastructure(id);
    if (!zone) throw new AppError(404, 'Zone not found');

    if (zone.sensors.length > 0 || zone.parkingStands.length > 0) {
      throw new AppError(
        409,
        `Conflict: Cannot delete ${zone.name}. It currently contains ${zone.sensors.length} sensors and ${zone.parkingStands.length} parking stands. You must reassign or remove this hardware first.`
      );
    }

    const deleted = await this.zoneRepository.delete(id);

    try {
      await redisClient.del(`static:zones:metadata:${zone.airportId}`);
    } catch (error) {
      console.warn('[Redis] Failed to clear cache upon zone deletion', error);
    }

    return deleted;
  }

  /**
   * @method getAnalytics
   * @description Simulates AI computer vision crowd counting and predictive bottleneck modeling.
   */
  public async getAnalytics(id: string) {
    const zone = await this.zoneRepository.findByIdWithInfrastructure(id);
    if (!zone) throw new AppError(404, 'Zone not found');

    const safeMaxCapacity = zone.maxCapacity ?? 1000;
    const currentOccupancy = Math.floor(safeMaxCapacity * (Math.random() * 0.6 + 0.3));
    const capacityPercentage = Math.round((currentOccupancy / safeMaxCapacity) * 100);

    const generateInsight = (percentage: number) => {
      if (percentage > 85) {
        return {
          alertLevel: 'CRITICAL',
          aiInsight: `Critical bottleneck detected in ${zone.name}. Density exceeds safe limits. AI recommends opening 3 immediate overflow queues.`,
        };
      }
      if (percentage > 70) {
        return {
          alertLevel: 'HIGH',
          aiInsight: `High traffic predicted to compound in next 15 minutes due to 2 inbound widebody flights. Consider dispatching additional ground staff.`,
        };
      }
      return {
        alertLevel: 'LOW',
        aiInsight: `Traffic is flowing optimally. No anomalies detected. Energy consumption is balanced.`,
      };
    };

    const { alertLevel, aiInsight } = generateInsight(capacityPercentage);

    return {
      zoneName: zone.name,
      metrics: {
        maxCapacity: safeMaxCapacity,
        currentOccupancy,
        capacityPercentage,
        alertLevel,
      },
      aiAnalysis: aiInsight,
      historicalTrafficChart: [
        { time: '10:00', passengers: Math.floor(currentOccupancy * 0.5) },
        { time: '11:00', passengers: Math.floor(currentOccupancy * 0.8) },
        { time: '12:00', passengers: Math.floor(currentOccupancy * 1.1) },
        { time: '13:00', passengers: Math.floor(currentOccupancy * 0.9) },
        { time: '14:00', passengers: currentOccupancy },
      ],
      demographicsPieChart: [
        { name: 'Checked-in', value: Math.floor(currentOccupancy * 0.6), fill: '#4ade80' },
        { name: 'Queuing', value: Math.floor(currentOccupancy * 0.3), fill: '#facc15' },
        { name: 'Idle/Retail', value: Math.floor(currentOccupancy * 0.1), fill: '#94a3b8' },
      ],
    };
  }
}

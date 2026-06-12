import { Prisma, ZoneType } from '@/generated/index';
import { prisma } from '@/common/configs/prisma';
import { BaseRepository } from '@/common/repositories/base.repository';
import { CreateZoneDTO, GetZonesQuery } from './zone.schema';

// Define a strict return type for a Zone that includes its child infrastructure
type ZoneWithInfrastructure = Prisma.ZoneGetPayload<{
  include: { sensors: true; parkingStands: true };
}>;

/**
 * @class ZoneRepository
 * @description
 */
export class ZoneRepository extends BaseRepository<Prisma.ZoneDelegate> {
  constructor() {
    // inject Prisma client delegate for Zone model
    super('zone');
  }

  /**
   * @method getStaticZones
   * @description Only fetch the skeleton data needed for UI Dropdowns/Menus scoped by tenant context.
   */
  public async getStaticZones(airportId?: string) {
    const where: Prisma.ZoneWhereInput = {};

    if (airportId) {
      where.OR = [{ airportId: airportId }, { airport: { code: airportId } }];
    }

    return await prisma.zone.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        floorLevel: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * @method create
   * @description Create a new Zone record
   *
   * @param data - The validated Zone payload
   * @returns The created Zone record
   */
  public async create(data: CreateZoneDTO) {
    return await prisma.zone.create({
      data: {
        name: data.name,
        type: data.type as ZoneType,
        floorLevel: data.floorLevel,
        maxCapacity: data.maxCapacity,
        gisItemId: data.gisItemId ?? null,
        gisSceneUrl: data.gisSceneUrl ?? null,
        airportId: data.airportId,
      },
    });
  }

  /**
   * @method findManyWithPagination
   * @description Fetch paginated zones filtered by floor levels, structural types, and airport tenant context.
   */
  public async findManyWithPagination(query: GetZonesQuery) {
    const where: Prisma.ZoneWhereInput = {};

    if (query.type !== undefined) {
      where.type = query.type as ZoneType;
    }

    if (query.floorLevel !== undefined) {
      where.floorLevel = query.floorLevel;
    }

    if (query.airportId) {
      where.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
    }

    return await this.executePagination<ZoneWithInfrastructure>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { name: 'asc' },
      // Include child entities so the UI can map what hardware is in this zone
      include: {
        sensors: true,
        parkingStands: true,
      },
    });
  }

  /**
   * @method findByIdWithInfrastructure
   * @description Fetches a single zone with all its deployed hardware
   */
  public async findByIdWithInfrastructure(id: string): Promise<ZoneWithInfrastructure | null> {
    return await prisma.zone.findUnique({
      where: { id },
      include: {
        sensors: true,
        parkingStands: true,
      },
    });
  }
}

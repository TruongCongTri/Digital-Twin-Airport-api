-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "gisFeatureId" TEXT;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "gisItemId" TEXT,
ADD COLUMN     "gisSceneUrl" TEXT;

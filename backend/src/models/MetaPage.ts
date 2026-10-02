import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// A Facebook Page a company has connected for Lead Ads. Like
// GoogleBusinessConnection, tokens live in their own table rather than in
// `integrations`, which never holds secrets. The page access token comes
// from a long-lived user token, so it doesn't expire on its own (it stops
// working if the user changes their password or removes the app).
interface MetaPageAttributes {
  id: number;
  pageId: string;
  pageName: string;
  pageAccessToken?: string | null;
  // True once the app is subscribed to this page's `leadgen` webhook.
  isSubscribed: boolean;
  subscribedAt?: Date | null;
  leadsReceived: number;
  lastLeadAt?: Date | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  connectedById?: number | null;
}

interface MetaPageCreationAttributes
  extends Optional<MetaPageAttributes, 'id' | 'isSubscribed' | 'leadsReceived'> {}

class MetaPage extends Model<MetaPageAttributes, MetaPageCreationAttributes> implements MetaPageAttributes {
  public id!: number;
  public pageId!: string;
  public pageName!: string;
  public pageAccessToken?: string | null;
  public isSubscribed!: boolean;
  public subscribedAt?: Date | null;
  public leadsReceived!: number;
  public lastLeadAt?: Date | null;
  public lastSyncAt?: Date | null;
  public lastError?: string | null;
  public connectedById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MetaPage.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    pageId: { type: DataTypes.STRING(40), allowNull: false },
    pageName: { type: DataTypes.STRING(255), allowNull: false },
    pageAccessToken: { type: DataTypes.TEXT, allowNull: true },
    isSubscribed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    subscribedAt: { type: DataTypes.DATE, allowNull: true },
    leadsReceived: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastLeadAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
    connectedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'meta_pages', sequelize, indexes: [{ fields: ['pageId'] }] }
);

export default MetaPage;

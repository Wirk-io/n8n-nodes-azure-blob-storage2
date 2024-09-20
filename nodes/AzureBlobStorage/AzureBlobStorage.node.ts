import {
	IBinaryKeyData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { containerOperations, blobOperations } from './AzureBlobDescription';

export class AzureBlobStorage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure Blob Storage',
		name: 'azureBlobStorage',
		icon: 'file:azureBlobStorage.svg',
		group: ['data'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with Azure Blob Storage, containers and blobs.',
		defaults: {
			name: 'Azure Blob Storage',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'azureStorageApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Container',
						value: 'container',
					},
					{
						name: 'Blob',
						value: 'blob',
					},
				],
				default: 'container',
			},

			...containerOperations,
			...blobOperations,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		//Get credentials the user provided for this node
		const credentials = (await this.getCredentials('azureStorageApi')) as IDataObject;
		const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } = require('@azure/storage-blob');
		const blobServiceClient = BlobServiceClient.fromConnectionString(credentials.connectionString);

		const items = this.getInputData();
		const returnData: IDataObject[] = [];
		const length = items.length;

		for (let i = 0; i < length; i++) {
			if (resource === 'container') {
				if (operation === 'create') {
					const containerName = this.getNodeParameter('container', i) as string;
					const containerClient = blobServiceClient.getContainerClient(containerName);
					const createContainerResponse = await containerClient.create();

					returnData.push(createContainerResponse as IDataObject);
				}
				else if(operation === 'delete'){
					const containerName = this.getNodeParameter('container', i) as string;
					const containerClient = blobServiceClient.getContainerClient(containerName);
					const deleteContainerResponse = await containerClient.delete();

					returnData.push(deleteContainerResponse as IDataObject);
				}
			} else if (resource === 'blob') {
				const containerName = this.getNodeParameter('container', i) as string;
				const containerClient = blobServiceClient.getContainerClient(containerName);

				if (operation === 'getMany') {
					let blobs = containerClient.listBlobsFlat();
					let arr: any[] = [];
					for await (const blob of blobs) {
						arr.push(blob);
					}
					returnData.push.apply(returnData, arr as IDataObject[]);
				} else if (operation === 'getSAP') {
					const blobName = this.getNodeParameter('blobName', i) as string;
					const blockBlobClient = containerClient.getBlockBlobClient(blobName);

					const permissions = new BlobSASPermissions();

					permissions.read = true;
					const startDate = new Date();
					const expiryDate = new Date(startDate);
					expiryDate.setHours(startDate.getDay() + 1);

					const sasOptions = {
						containerName,
						blobName,
						permissions: permissions.toString(),
						startsOn: startDate,
						expiresOn: expiryDate
					};

					const sasToken = generateBlobSASQueryParameters(sasOptions, credentials).toString();

					const blobUrlWithSAS = `${blockBlobClient.url}?${sasToken}`;

					const urlObject: IDataObject = {
						blobUrlSAS: blobUrlWithSAS
					};

					returnData.push(urlObject);

				} else if (operation === 'get') {
					const blobName = this.getNodeParameter('blobName', i) as string;
					const blockBlobClient = containerClient.getBlockBlobClient(blobName);
					const downloadBlockBlobResponse = await blockBlobClient.download();

					const newItemBinary: IBinaryKeyData = {};
					const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody) as Buffer;
					newItemBinary.data = await this.helpers.prepareBinaryData(buffer);
					newItemBinary.data.mimeType = downloadBlockBlobResponse.contentType;

					returnData.push({
						json: {
							"blobName": blobName,
							"blobType": downloadBlockBlobResponse.blobType,
							"contentEncoding" : downloadBlockBlobResponse.contentEncoding,
							"contentLanguage" : downloadBlockBlobResponse.contentLanguage,
							"contentLength" : downloadBlockBlobResponse.contentLength,
							"contentType" : downloadBlockBlobResponse.contentType,
							"lastAccessed" : downloadBlockBlobResponse.lastAccessed,
							"lastModified" : downloadBlockBlobResponse.lastModified,
							"leaseDuration" : downloadBlockBlobResponse.leaseDuration,
							"leaseState" : downloadBlockBlobResponse.leaseState,
							"leaseStatus" : downloadBlockBlobResponse.leaseStatus,
						},
						pairedItem: {
						  item: i,
						},
						binary: Object.keys(newItemBinary).length === 0 ? undefined : newItemBinary,
					  });

				} else if (operation === 'upload') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

					if (items[i].binary === undefined) {
						throw new NodeOperationError(this.getNode(), 'No binary data exists on item!', {
							itemIndex: i,
						});
					}

					const item = items[i].binary as IBinaryKeyData;
					const binaryData = item[binaryPropertyName];
					const binaryDataBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

					if (binaryData === undefined) {
						throw new NodeOperationError(
							this.getNode(),
							`No binary data property "${binaryPropertyName}" does not exists on item!`,
							{ itemIndex: i },
						);
					}
					const blobName = this.getNodeParameter('blobName', i) as string;
					const blockBlobClient = containerClient.getBlockBlobClient(blobName);
					const uploadBlobResponse = await blockBlobClient.upload(
						binaryDataBuffer,
						binaryDataBuffer.length,
					);
					returnData.push(uploadBlobResponse as IDataObject);
				} else if(operation === 'delete'){
					const blobName = this.getNodeParameter('blobName', i) as string;
					const blockBlobClient = containerClient.getBlockBlobClient(blobName);
					const options = {
						deleteSnapshots: 'include' // or 'only'
					  }

					const deleteBlobResponse = await blockBlobClient.deleteIfExists(options);
					returnData.push(deleteBlobResponse as IDataObject);
				}
			}
		}

		// No node input
		if (resource === 'container') {
			if (operation === 'getMany') {
				let containers = blobServiceClient.listContainers();
				let arr: any[] = [];
				for await (const container of containers) {
					arr.push(container);
				}
				returnData.push.apply(returnData, arr as IDataObject[]);
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}


async function streamToBuffer(readableStream: NodeJS.ReadableStream) {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      readableStream.on("error", reject);
    });
  }

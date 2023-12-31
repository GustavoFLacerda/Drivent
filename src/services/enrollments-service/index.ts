import { Address, Enrollment } from '@prisma/client';
import { request } from '@/utils/request';
import { invalidDataError, notFoundError } from '@/errors';
import addressRepository, { CreateAddressParams } from '@/repositories/address-repository';
import enrollmentRepository, { CreateEnrollmentParams } from '@/repositories/enrollment-repository';
import { exclude } from '@/utils/prisma-utils';
import { ViaCEPAddress } from '@/protocols';

// TODO - Receber o CEP por parâmetro nesta função.
async function getAddressFromCEP(query: string) {

  // FIXME: está com CEP fixo!
  const result = await request.get(`${process.env.VIA_CEP_API}/${query}/json/`);

  if (!result.data) {
    throw notFoundError();
  }

  // FIXME: não estamos interessados em todos os campos
  const { bairro, localidade, uf, complemento, logradouro } = result.data;
  const endereço:ViaCEPAddress = {
    logradouro,
    uf,
    bairro,
    complemento,
    cidade: localidade
  }
  return endereço
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, 'userId', 'createdAt', 'updatedAt', 'Address'),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, 'userId' | 'createdAt' | 'updatedAt'>;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, 'createdAt', 'updatedAt', 'enrollmentId');
}

type GetAddressResult = Omit<Address, 'createdAt' | 'updatedAt' | 'enrollmentId'>;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, 'address');
  const address = getAddressForUpsert(params.address);

  // TODO - Verificar se o CEP é válido antes de associar ao enrollment.

  try{
    const promessa = await getAddressFromCEP(address.cep);
    if(!promessa.cidade){
      throw invalidDataError(['cep inválido']);
    }
  }
  catch{
    throw invalidDataError(['cep inválido']);

  }

  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, 'userId'));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP,
};

export default enrollmentsService;

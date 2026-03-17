interface ValidateUser {
  user: string;
}

interface ValidaPin {
  pin: string;
}

type NewPasswordType = {
  password: string;
  confirmPassword: string;
};
export { NewPasswordType, ValidaPin, ValidateUser };


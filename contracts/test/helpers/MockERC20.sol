// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        require(balanceOf[msg.sender] >= amount, "InsufficientBalance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        require(balanceOf[from] >= amount, "InsufficientBalance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "InsufficientAllowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract FeeOnTransferERC20 is MockERC20 {
    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(balanceOf[from] >= amount, "InsufficientBalance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "InsufficientAllowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        uint256 fee = amount / 10;
        uint256 received = amount - fee;
        balanceOf[to] += received;
        emit Transfer(from, to, received);
        return true;
    }
}

contract FailingERC20 is MockERC20 {
    bool public shouldFail;

    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function setShouldFail(bool fail) external {
        shouldFail = fail;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (shouldFail) revert("TransferFailed");
        return super.transfer(to, amount);
    }
}

contract HostileERC20 is MockERC20 {
    address public target;
    bytes public data;

    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function setAttack(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (target != address(0) && data.length > 0) {
            address t = target;
            bytes memory d = data;
            target = address(0);
            data = "";
            (bool ok,) = t.call(d);
            if (!ok) {
                assembly {
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }
            }
        }
        return super.transferFrom(from, to, amount);
    }
}
